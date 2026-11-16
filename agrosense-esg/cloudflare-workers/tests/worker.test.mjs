// Executar: node --test cloudflare-workers/tests/worker.test.mjs  (Node 18+)
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.js';
const { calcular, ValidationError } = worker, handle = worker.fetch;

const VALID = { energy_kwh: 6.6, planted_area_m2: 1000, carbon_factor_kg_per_kwh: 0.08 };
const call = async (body, method = 'POST', env = {}, raw = false) => {
  const r = await handle(new Request('https://x.test/', { method, headers: { Origin: 'http://localhost:8080', 'Content-Type': 'application/json' },
    body: method === 'POST' ? (raw ? body : JSON.stringify(body)) : undefined }), env);
  const t = await r.text(); return [r.status, t ? JSON.parse(t) : null, r.headers];
};

test('cálculo igual ao da função Python', () => {
  const r = calcular(VALID);
  assert.equal(r.carbon.estimated_emissions_kg_co2e, 0.53);
  assert.equal(r.land.planted_area_hectares, 0.1);
  assert.equal(r.compensation.estimated_trees_equivalent, 1);
  assert.equal(r.esg.index, 82.7);
  assert.equal(r.esg.classification, 'Excelente');
  assert.deepEqual(r.esg.sub_scores, { carbon: 89.4, energy: 67 });
});
test('energia zero, absorção customizada e índice limitado', () => {
  assert.equal(calcular({ ...VALID, energy_kwh: 0 }).esg.index, 100);
  assert.equal(calcular({ ...VALID, energy_kwh: 500, absorption_kg_per_tree_year: 10 }).compensation.estimated_trees_equivalent, 4);
  const r = calcular({ energy_kwh: 100000, planted_area_m2: 10, carbon_factor_kg_per_kwh: 2 });
  assert.deepEqual([r.esg.index, r.esg.classification], [0, 'Crítica']);
});
test('validações', () => {
  const bad = [{ energy_kwh: 1, planted_area_m2: 1 }, { ...VALID, energy_kwh: -1 }, { ...VALID, planted_area_m2: 0 }, { ...VALID, carbon_factor_kg_per_kwh: 5 },
    { ...VALID, energy_kwh: '6' }, { ...VALID, absorption_kg_per_tree_year: 0 }, [], { ...VALID, planted_area_m2: true }];
  for (const b of bad) assert.throws(() => calcular(b), ValidationError);
});
test('HTTP: 200, 400, 405, 204 e CORS', async () => {
  let [s, b, h] = await call(VALID); assert.equal(s, 200); assert.equal(b.success, true); assert.equal(h.get('Access-Control-Allow-Origin'), '*');
  assert.equal((await call({ ...VALID, energy_kwh: -3 }))[0], 400);
  assert.equal((await call('{ruim', 'POST', {}, true))[0], 400);
  assert.equal((await call(null, 'GET'))[0], 405);
  assert.equal((await call(null, 'OPTIONS'))[0], 204);
  [s, , h] = await call(VALID, 'POST', { ALLOWED_ORIGIN: 'https://outro.com' }); assert.equal(h.get('Access-Control-Allow-Origin'), null);
  [, , h] = await call(VALID, 'POST', { ALLOWED_ORIGIN: 'http://localhost:8080,https://outro.com' }); assert.equal(h.get('Access-Control-Allow-Origin'), 'http://localhost:8080');
});
