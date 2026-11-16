// Teste de fumaça da interface com um DOM falso (sem navegador): garante que render() não quebra em nenhum estado.
// Executar: node --test tests/render.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const els = {}; let domReady = null;
const mk = (id) => ({ id, innerHTML: '', textContent: '', hidden: false, disabled: false, value: '', handlers: {},
  addEventListener(t, fn) { this.handlers[t] = fn; }, reportValidity: () => true });
const FIELDS = { soil_moisture: 25, temperature: 32, crop_type: 'milho', area_m2: 1000, pump_power_kw: 2.2, operating_hours: 3, peak_hours: 1,
  off_peak_hours: 2, electricity_rate_peak: 1.2, electricity_rate_off_peak: 0.65, water_rate_per_m3: 5, carbon_factor_kg_per_kwh: 0.08 };
global.document = { getElementById: (id) => (els[id] = els[id] || mk(id)), addEventListener: (t, fn) => { if (t === 'DOMContentLoaded') domReady = fn; } };
global.window = globalThis;
const store = {}; global.sessionStorage = { getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = v; }, removeItem: (k) => { delete store[k]; } };
require('../app.js');

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function setup() {
  $('form').elements = Object.entries(FIELDS).map(([name, v]) => ({ name, type: typeof v === 'number' ? 'number' : 'text', value: String(v) }));
  domReady();
  $('mode').value = 'local'; $('failAt').value = ''; $('only').value = ''; $('isoWater').value = '8500'; $('isoKwh').value = '6.6';
}
const submit = () => $('form').handlers.submit({ preventDefault() {} });

test('carregamento inicial não lança erro e mostra estados vazios', () => {
  assert.doesNotThrow(setup);
  assert.match($('kpis').innerHTML, /Execute a simulação/);
  assert.match($('chips').innerHTML, /Cloudflare Workers/);
  assert.doesNotMatch($('chips').innerHTML, /Google/);
});
test('cadeia completa em simulação local conclui os três módulos e preenche os indicadores', async () => {
  submit(); await sleep(1500);
  assert.equal(($('mods').innerHTML.match(/Concluído/g) || []).length, 3);
  assert.match($('kpis').innerHTML, /kg/);
  assert.match($('hist').innerHTML, /Simulação local/);
});
test('teste isolado da Cloudflare não preenche os outros módulos', async () => {
  $('only').value = 'cloudflare'; submit(); await sleep(700);
  assert.match($('mods').innerHTML, /Não executado/);
  assert.match($('mods').innerHTML, /Teste isolado: entrada manual/);
});
test('modo nuvem sem endpoints: AWS com erro, demais bloqueados, sem exceção', async () => {
  $('only').value = ''; $('mode').value = 'cloud'; submit(); await sleep(300);
  assert.match($('mods').innerHTML, /Endpoint não configurado/);
  assert.match($('mods').innerHTML, /Bloqueado/);
});
test('falha simulada na Azure (local): AWS concluída, Azure com erro, Cloudflare bloqueada', async () => {
  domReady();
  $('mode').value = 'local'; $('failAt').value = 'azure'; submit(); await sleep(1200);
  const h = $('mods').innerHTML;
  assert.match(h, /Tentar novamente/); assert.match(h, /Bloqueado/); assert.match(h, /Concluído/);
});
