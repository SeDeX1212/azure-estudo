// Executar: node --test tests/pipeline.test.js   (Node 18+)
const test = require('node:test');
const assert = require('node:assert/strict');
const { runPipeline, newState, callService, localFetch } = require('../app.js');

const INPUTS = { soil_moisture: 25, temperature: 32, crop_type: 'milho', area_m2: 1000, pump_power_kw: 2.2, operating_hours: 3,
  peak_hours: 1, off_peak_hours: 2, electricity_rate_peak: 1.2, electricity_rate_off_peak: 0.65, water_rate_per_m3: 5, carbon_factor_kg_per_kwh: 0.08 };
const CFG = { endpoints: { aws: 'https://aws.test', azure: 'https://azure.test', google: 'https://google.test' }, timeoutMs: 60 };
const BODIES = {
  'https://aws.test': { success: true, provider: 'AWS Lambda', irrigation: { total_water_liters: 8500, water_liters_per_m2: 8.5, need_level: 'Alta' } },
  'https://azure.test': { success: true, provider: 'Azure Functions', energy: { total_kwh: 6.6 }, water: {}, total_operational_cost: 48 },
  'https://google.test': { success: true, provider: 'Google Cloud Run Functions', carbon: {}, compensation: {}, esg: { index: 80 } },
};
const ok = (url) => ({ ok: true, status: 200, json: async () => BODIES[url] });
const abortable = (signal) => new Promise((_, rej) => signal.addEventListener('abort', () => { const e = new Error('abort'); e.name = 'AbortError'; rej(e); }));

test('execução completa encadeia os três serviços e usa a saída anterior', async () => {
  const sent = {};
  const f = async (url, o) => { sent[url] = JSON.parse(o.body); return ok(url); };
  const s = await runPipeline(INPUTS, newState(), 0, { cfg: CFG, fetchImpl: f });
  assert.deepEqual(Object.values(s.status), ['done', 'done', 'done']);
  assert.equal(sent['https://azure.test'].water_liters, 8500);
  assert.equal(sent['https://google.test'].energy_kwh, 6.6);
  assert.ok(Object.values(s.ms).every((m) => typeof m === 'number'));
});

for (const [idx, key] of ['aws', 'azure', 'google'].entries()) {
  test(`falha no serviço ${key} preserva anteriores e bloqueia dependentes`, async () => {
    const f = async (url) => { if (url.includes(key)) throw new TypeError('x'); return ok(url); };
    const s = await runPipeline(INPUTS, newState(), 0, { cfg: CFG, fetchImpl: f });
    ['aws', 'azure', 'google'].forEach((k, i) => {
      if (i < idx) { assert.equal(s.status[k], 'done'); assert.ok(s.results[k]); }
      else if (i === idx) assert.equal(s.status[k], 'error');
      else { assert.equal(s.status[k], 'blocked'); assert.equal(s.results[k], undefined); }
    });
  });
}

test('timeout é detectado via AbortController', async () => {
  await assert.rejects(() => callService('https://x.test', {}, 30, (u, o) => abortable(o.signal)), (e) => e.kind === 'timeout');
});

test('erro HTTP usa a mensagem do serviço e falha de conexão é classificada', async () => {
  const http = async () => ({ ok: false, status: 400, json: async () => ({ success: false, error: { message: 'Campo inválido' } }) });
  await assert.rejects(() => callService('https://x.test', {}, 100, http), (e) => e.kind === 'http' && e.status === 400 && /Campo inválido/.test(e.message));
  await assert.rejects(() => callService('https://x.test', {}, 100, async () => { throw new TypeError('f'); }), (e) => e.kind === 'network');
  await assert.rejects(() => callService('', {}, 100, ok), (e) => e.kind === 'config');
});

test('nova tentativa a partir do módulo que falhou mantém o resultado da AWS', async () => {
  let azureUp = false;
  const f = async (url) => { if (url.includes('azure') && !azureUp) throw new TypeError('x'); return ok(url); };
  const state = await runPipeline(INPUTS, newState(), 0, { cfg: CFG, fetchImpl: f });
  assert.deepEqual([state.status.aws, state.status.azure, state.status.google], ['done', 'error', 'blocked']);
  const awsResult = state.results.aws;
  azureUp = true;
  await runPipeline(INPUTS, state, 1, { cfg: CFG, fetchImpl: f });
  assert.deepEqual(Object.values(state.status), ['done', 'done', 'done']);
  assert.equal(state.results.aws, awsResult);
});

test('modo de simulação local executa a cadeia e se identifica como simulação', async () => {
  const local = { endpoints: { aws: 'local://aws', azure: 'local://azure', google: 'local://google' }, timeoutMs: 2000 };
  const s = await runPipeline(INPUTS, newState(), 0, { cfg: local, fetchImpl: localFetch });
  assert.deepEqual(Object.values(s.status), ['done', 'done', 'done']);
  assert.equal(s.results.aws.simulated, true);
  assert.match(s.results.aws.provider, /não é nuvem/);
  assert.equal(s.results.aws.irrigation.water_liters_per_m2, 10.59);
  assert.equal(s.results.azure.energy.total_kwh, 6.6);
});
