/* AgroSense ESG - frontend. Encadeia AWS -> Azure -> Cloudflare Workers via fetch, com timeout, isolamento de falhas e retry. */
(function (root) {
  'use strict';
  const DEFAULT_CFG = { endpoints: { aws: '', azure: '', cloudflare: '' }, timeoutMs: 15000 };
  const DOWN_URL = 'https://endpoint-indisponivel.invalid/';
  const STATUS_TXT = { waiting: 'Aguardando', loading: 'Processando', done: 'Concluído', error: 'Erro', blocked: 'Bloqueado por dependência' };

  class ServiceError extends Error {
    constructor(kind, message, extra) { super(message); this.kind = kind; Object.assign(this, extra || {}); }
  }

  const STEPS = [
    { key: 'aws', title: 'Irrigação', provider: 'AWS Lambda', icon: 'droplet',
      payload: (i) => ({ soil_moisture: i.soil_moisture, temperature: i.temperature, crop_type: i.crop_type, area_m2: i.area_m2 }) },
    { key: 'azure', title: 'Custos operacionais', provider: 'Azure Functions', icon: 'zap',
      payload: (i, r) => ({ water_liters: r.aws.irrigation.total_water_liters, pump_power_kw: i.pump_power_kw,
        operating_hours: i.operating_hours, peak_hours: i.peak_hours, off_peak_hours: i.off_peak_hours,
        electricity_rate_peak: i.electricity_rate_peak, electricity_rate_off_peak: i.electricity_rate_off_peak,
        water_rate_per_m3: i.water_rate_per_m3 }) },
    { key: 'cloudflare', title: 'Carbono e ESG', provider: 'Cloudflare Workers', icon: 'wind',
      payload: (i, r) => ({ energy_kwh: r.azure.energy.total_kwh, planted_area_m2: i.area_m2,
        carbon_factor_kg_per_kwh: i.carbon_factor_kg_per_kwh }) },
  ];

  // ---------- chamada HTTP com timeout e erros classificados ----------
  async function callService(url, payload, timeoutMs, fetchImpl) {
    if (!url) throw new ServiceError('config', 'Endpoint não configurado. Preencha as URLs em config.js.');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const t0 = performance.now();
    const elapsed = () => Math.round(performance.now() - t0);
    try {
      const res = await fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload), signal: ctrl.signal });
      let data = null;
      try { data = await res.json(); } catch (_) { /* corpo não-JSON */ }
      const ms = elapsed();
      if (!res.ok) {
        const msg = data && data.error && data.error.message;
        throw new ServiceError('http', msg ? `O serviço recusou a requisição (HTTP ${res.status}): ${msg}` : `O serviço respondeu com erro HTTP ${res.status}.`, { status: res.status, ms });
      }
      if (!data || data.success !== true) throw new ServiceError('invalid', 'O serviço retornou uma resposta inesperada.', { ms });
      return { data, ms };
    } catch (e) {
      if (e instanceof ServiceError) throw e;
      if (e && e.name === 'AbortError') throw new ServiceError('timeout', `Tempo limite de ${timeoutMs} ms excedido.`, { ms: elapsed() });
      throw new ServiceError('network', 'Falha de conexão: serviço indisponível, rede offline ou CORS não autorizado.', { ms: elapsed() });
    } finally { clearTimeout(timer); }
  }

  // aceita 'google' como nome antigo da chave do 3º serviço (compatibilidade com config.js anterior)
  const endpointOf = (cfg, key) => ((cfg.endpoints || {})[key] || (key === 'cloudflare' ? (cfg.endpoints || {}).google : '') || '');

  function newState() {
    return { results: {}, status: { aws: 'waiting', azure: 'waiting', cloudflare: 'waiting' }, ms: {}, errors: {}, sim: false, recorded: false };
  }

  // ---------- pipeline: executa a partir do passo `start`, preservando resultados anteriores ----------
  async function runPipeline(inputs, state, start, deps) {
    const cfg = Object.assign({}, DEFAULT_CFG, deps.cfg || {});
    const notify = deps.onUpdate || function () {};
    STEPS.forEach((s, i) => {
      if (i >= start) { delete state.results[s.key]; delete state.ms[s.key]; delete state.errors[s.key]; state.status[s.key] = 'waiting'; }
    });
    state.recorded = false; state.inputs = inputs;
    notify(state);
    for (let i = start; i < STEPS.length; i++) {
      const s = STEPS[i];
      if (i > 0 && !state.results[STEPS[i - 1].key]) { state.status[s.key] = 'blocked'; continue; }
      state.status[s.key] = 'loading'; notify(state);
      const url = deps.failAt === s.key ? DOWN_URL : endpointOf(cfg, s.key);
      try {
        const { data, ms } = await callService(url, s.payload(inputs, state.results), cfg.timeoutMs, deps.fetchImpl);
        state.results[s.key] = data; state.ms[s.key] = ms; state.status[s.key] = 'done';
      } catch (e) {
        state.status[s.key] = 'error'; state.errors[s.key] = e.message; state.ms[s.key] = e.ms;
      }
      notify(state);
    }
    return state;
  }

  // ---------- teste isolado de UM módulo, com entrada informada manualmente (não encadeia nem inventa resultados) ----------
  async function runSingle(inputs, state, key, deps, manual) {
    const cfg = Object.assign({}, DEFAULT_CFG, deps.cfg || {});
    const notify = deps.onUpdate || function () {};
    STEPS.forEach((s) => { delete state.results[s.key]; delete state.ms[s.key]; delete state.errors[s.key]; state.status[s.key] = 'waiting'; });
    state.isolated = key; state.recorded = true; state.inputs = inputs;
    const step = STEPS.find((s) => s.key === key);
    const manualResults = { aws: { irrigation: { total_water_liters: manual.water_liters } }, azure: { energy: { total_kwh: manual.energy_kwh } } };
    state.status[key] = 'loading'; notify(state);
    const url = deps.failAt === key ? DOWN_URL : endpointOf(cfg, key);
    try {
      const { data, ms } = await callService(url, step.payload(inputs, manualResults), cfg.timeoutMs, deps.fetchImpl);
      state.results[key] = data; state.ms[key] = ms; state.status[key] = 'done';
    } catch (e) { state.status[key] = 'error'; state.errors[key] = e.message; state.ms[key] = e.ms; }
    notify(state);
    return state;
  }

  // ---------- simulação local (NÃO é nuvem): usa as mesmas fórmulas apenas para demonstrar a interface ----------
  function localFetch(url, opts) {
    if (url === DOWN_URL) return Promise.reject(new TypeError('Failed to fetch'));
    const key = url.replace('local://', ''); const p = JSON.parse(opts.body);
    const IDEAL = { milho: 60, soja: 65, cafe: 55, tomate: 70 };
    let out;
    if (key === 'aws') {
      const perM2 = Math.max(0, IDEAL[p.crop_type] - p.soil_moisture) * 0.25 * (1 + Math.max(0, p.temperature - 25) * 0.03);
      const lvl = perM2 <= 0 ? 'Nenhuma' : perM2 < 3 ? 'Baixa' : perM2 < 7 ? 'Moderada' : 'Alta';
      out = { service: 'irrigation', irrigation: { water_liters_per_m2: +perM2.toFixed(2), total_water_liters: +(perM2 * p.area_m2).toFixed(2), need_level: lvl, message: 'Simulação local com as mesmas fórmulas.' } };
    } else if (key === 'azure') {
      const r2 = (n) => Math.round(n * 100) / 100;
      const pk = p.pump_power_kw * p.peak_hours, of = p.pump_power_kw * p.off_peak_hours;
      const pc = r2(pk * p.electricity_rate_peak), oc = r2(of * p.electricity_rate_off_peak), wc = r2(p.water_liters / 1000 * p.water_rate_per_m3);
      out = { service: 'operational_cost', energy: { total_kwh: r2(pk + of), peak_kwh: r2(pk), off_peak_kwh: r2(of), peak_cost: pc, off_peak_cost: oc, total_energy_cost: r2(pc + oc) },
        water: { volume_liters: p.water_liters, volume_m3: r2(p.water_liters / 1000), total_water_cost: wc }, total_operational_cost: r2(pc + oc + wc), currency: 'BRL' };
    } else { // 'cloudflare'
      const em = p.energy_kwh * p.carbon_factor_kg_per_kwh, ha = p.planted_area_m2 / 10000;
      const cs = 100 * Math.max(0, 1 - em / ha / 50), es = 100 * Math.max(0, 1 - p.energy_kwh / ha / 200);
      const idx = Math.round((0.7 * cs + 0.3 * es) * 10) / 10;
      out = { service: 'carbon_esg', carbon: { energy_kwh: p.energy_kwh, emission_factor: p.carbon_factor_kg_per_kwh, estimated_emissions_kg_co2e: +em.toFixed(2) },
        land: { planted_area_m2: p.planted_area_m2, planted_area_hectares: +ha.toFixed(4) }, compensation: { estimated_trees_equivalent: Math.ceil(em / 20 - 1e-9), absorption_factor_kg_per_tree_year: 20 },
        esg: { index: idx, classification: idx >= 80 ? 'Excelente' : idx >= 60 ? 'Boa' : idx >= 40 ? 'Moderada' : 'Crítica', methodology: '70% nota de carbono + 30% nota de energia (mesma fórmula da função real).' } };
    }
    const body = Object.assign({ success: true, provider: 'Simulação local (não é nuvem)', simulated: true }, out);
    return new Promise((ok) => setTimeout(() => ok({ ok: true, status: 200, json: async () => body }), 250));
  }

  const api = { ServiceError, STEPS, callService, newState, runPipeline, runSingle, localFetch, DEFAULT_CFG };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.AgroSense = api;
  if (typeof document === 'undefined') return;

  // ================= Interface =================
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n, d = 2) => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const brl = (n) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const ICONS = {
    droplet: '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>',
    zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
    wind: '<path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2"/><path d="M9.6 4.6A2 2 0 1 1 11 8H2"/><path d="M12.6 19.4A2 2 0 1 0 14 16H2"/>',
    leaf: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>',
    cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/>',
  };
  const icon = (n) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[n]}</svg>`;
  const cfg = Object.assign({}, DEFAULT_CFG, root.AGROSENSE_CONFIG || {});
  const label = (s) => (cfg.providerLabels || {})[s.key] || s.provider;
  const LOCAL_CFG = { endpoints: { aws: 'local://aws', azure: 'local://azure', cloudflare: 'local://cloudflare' }, timeoutMs: 5000 };
  let state = newState(), running = false, lastDeps = null, lastInputs = null, lastSingle = null, lastManual = null;

  function readForm() {
    const f = $('form'), out = {};
    for (const el of f.elements) if (el.name) out[el.name] = el.type === 'number' ? parseFloat(el.value) : el.value;
    return out;
  }
  function validateForm() {
    const f = $('form');
    if (!f.reportValidity()) return 'Corrija os campos destacados antes de executar.';
    const v = readForm();
    if (Math.abs(v.peak_hours + v.off_peak_hours - v.operating_hours) > 0.01) return 'Horas de ponta + fora de ponta devem ser iguais ao tempo total de operação.';
    return '';
  }
  const deps = () => {
    const local = $('mode').value === 'local';
    return { cfg: local ? LOCAL_CFG : cfg, fetchImpl: local ? localFetch : fetch.bind(window), failAt: $('failAt').value || null, onUpdate: render };
  };

  function modBody(s, i) {
    const st = state.status[s.key], r = state.results[s.key];
    if (st === 'waiting') return state.isolated ? '<p>Não executado (teste isolado de outro módulo).</p>' : '<p>Aguardando execução.</p>';
    if (st === 'loading') return '<p><span class="spin"></span>Processando na nuvem…</p>';
    if (st === 'blocked') return `<p>Bloqueado: depende do resultado de “${esc(STEPS[i - 1].title)}”. Nenhum valor é exibido sem dados reais.</p>`;
    if (st === 'error') return `<p class="err"><strong>${esc(s.title)} indisponível.</strong> ${esc(state.errors[s.key])}</p>`;
    if (s.key === 'aws') return `<dl><dt>Necessidade</dt><dd>${esc(r.irrigation.need_level)}</dd><dt>Lâmina recomendada</dt><dd>${num(r.irrigation.water_liters_per_m2)} L/m²</dd><dt>Volume total</dt><dd>${num(r.irrigation.total_water_liters)} L</dd></dl>`;
    if (s.key === 'azure') return `<dl><dt>Energia</dt><dd>${num(r.energy.total_kwh)} kWh</dd><dt>Custo de energia (ponta / fora)</dt><dd>${brl(r.energy.peak_cost)} / ${brl(r.energy.off_peak_cost)}</dd><dt>Custo hídrico (${num(r.water.volume_m3)} m³)</dt><dd>${brl(r.water.total_water_cost)}</dd><dt>Custo total</dt><dd>${brl(r.total_operational_cost)}</dd></dl>`;
    return `<dl><dt>Emissões estimadas</dt><dd>${num(r.carbon.estimated_emissions_kg_co2e)} kg CO₂e</dd><dt>Árvores equivalentes</dt><dd>${r.compensation.estimated_trees_equivalent}</dd><dt>Índice ESG</dt><dd>${num(r.esg.index, 1)} (${esc(r.esg.classification)})</dd></dl>`;
  }

  function render() {
    $('chips').innerHTML = STEPS.map((s) => `<li class="chip"><span class="dot" data-s="${state.status[s.key]}"></span>${esc(label(s))} · ${STATUS_TXT[state.status[s.key]]}</li>`).join('');
    $('mods').innerHTML = STEPS.map((s, i) => {
      const st = state.status[s.key], r = state.results[s.key], ms = state.ms[s.key];
      const tag = (r && r.simulated ? '<span class="sim">Simulação local, não é nuvem</span>' : '') + (state.isolated === s.key && st !== 'waiting' ? '<span class="sim">Teste isolado: entrada manual</span>' : '');
      const retry = st === 'error' && !running ? `<button class="btn small" data-retry="${i}" type="button">Tentar novamente</button>` : '';
      return `<article class="mod" data-s="${st}"><div class="mod-h"><div class="mod-t"><span class="mod-ic">${icon(s.icon)}</span><div><h3>${esc(s.title)}</h3><p>${esc(r ? r.provider : label(s))}</p></div></div><span class="badge">${STATUS_TXT[st]}</span></div><div class="mod-b">${modBody(s, i)}</div><div class="mod-f">${ms != null ? `<span>Tempo de resposta: <strong>${ms} ms</strong></span>` : ''}${tag}${retry}</div></article>`;
    }).join('');
    renderKpis(); renderViz();
    const allDone = STEPS.every((s) => state.status[s.key] === 'done');
    if (allDone && !state.recorded) { state.recorded = true; saveHistory(); }
  }

  function kpi(ic, label, value, hint) {
    return `<div class="kpi">${icon(ic)}<span class="l">${label}</span><span class="v${value ? '' : ' empty'}">${value || '—'}</span><span class="h">${value ? hint : 'Execute a simulação'}</span></div>`;
  }
  function renderKpis() {
    const a = state.results.aws, z = state.results.azure, g = state.results.cloudflare;
    $('kpis').innerHTML = kpi('droplet', 'Irrigação recomendada', a && `${num(a.irrigation.total_water_liters, 0)} L`, a ? `${num(a.irrigation.water_liters_per_m2)} L/m² · AWS` : '')
      + kpi('cash', 'Custo operacional', z && brl(z.total_operational_cost), 'Energia + água · Azure')
      + kpi('zap', 'Consumo de energia', z && `${num(z.energy.total_kwh)} kWh`, 'Bomba · Azure')
      + kpi('wind', 'Emissões estimadas', g && `${num(g.carbon.estimated_emissions_kg_co2e)} kg`, 'CO₂e · Cloudflare Workers')
      + kpi('leaf', 'Índice ESG demonstrativo', g && `${num(g.esg.index, 1)} / 100`, g ? g.esg.classification : '');
  }

  function renderViz() {
    const a = state.results.aws, z = state.results.azure, g = state.results.cloudflare, parts = [];
    if (a) {
      const w = Math.min(100, a.irrigation.water_liters_per_m2 / 15 * 100);
      parts.push(`<div class="vz"><h3>Consumo hídrico</h3><div class="big">${num(a.irrigation.water_liters_per_m2)} L/m²</div><div class="bar" role="img" aria-label="Lâmina de ${num(a.irrigation.water_liters_per_m2)} L/m² em escala de 0 a 15"><span style="width:${w}%"></span></div><small>Escala visual de 0 a 15 L/m². Necessidade: ${esc(a.irrigation.need_level)}. Volume total: ${num(a.irrigation.total_water_liters, 0)} L.</small></div>`);
    }
    if (z) {
      const e = z.energy.total_energy_cost, w = z.water.total_water_cost, t = e + w, pe = t > 0 ? e / t * 100 : 0;
      parts.push(`<div class="vz"><h3>Custos de energia e água</h3><div class="donut" role="img" aria-label="Energia ${num(pe, 0)}% e água ${num(100 - pe, 0)}% do custo" style="background:conic-gradient(#d9a400 0 ${pe}%,#2f8a4f ${pe}% 100%)"></div><div class="legend"><span><i style="background:#d9a400"></i>Energia: ${brl(e)}</span><span><i style="background:#2f8a4f"></i>Água: ${brl(w)}</span></div></div>`);
    }
    if (g) {
      parts.push(`<div class="vz"><h3>Carbono estimado</h3><div class="big">${num(g.carbon.estimated_emissions_kg_co2e)} kg CO₂e</div><div class="bar"><span style="width:${Math.min(100, (g.carbon.carbon_intensity_kg_per_ha || 0) / 50 * 100)}%;background:#9a5b00"></span></div><small>Intensidade: ${num(g.carbon.carbon_intensity_kg_per_ha ?? 0)} kg CO₂e/ha (referência 50). Árvores equivalentes: ${g.compensation.estimated_trees_equivalent} (absorção adotada: ${g.compensation.absorption_factor_kg_per_tree_year} kg/árvore/ano; não são créditos certificados).</small></div>`);
      parts.push(`<div class="vz"><h3>Índice ESG demonstrativo</h3><div class="big">${num(g.esg.index, 1)} <small>/ 100 · ${esc(g.esg.classification)}</small></div><div class="scale" role="img" aria-label="Índice ${num(g.esg.index, 1)} de 100"><b style="left:${Math.min(100, Math.max(0, g.esg.index))}%"></b></div><div class="ticks"><span>0</span><span>40</span><span>60</span><span>80</span><span>100</span></div><p class="meth">${esc(g.esg.methodology)} Não é certificação ESG oficial.</p></div>`);
    }
    $('viz').innerHTML = parts.join('') || '<p class="empty-msg">Os gráficos aparecem quando houver resultados reais de pelo menos um serviço.</p>';
  }

  // ---------- histórico (sessionStorage) ----------
  const HK = 'agrosense_hist';
  const loadHist = () => { try { return JSON.parse(sessionStorage.getItem(HK) || '[]'); } catch (_) { return []; } };
  function saveHistory() {
    const r = state.results, i = state.inputs, h = loadHist();
    h.push({ t: new Date().toLocaleTimeString('pt-BR'), crop: i.crop_type, area: i.area_m2, liters: r.aws.irrigation.total_water_liters,
      cost: r.azure.total_operational_cost, kwh: r.azure.energy.total_kwh, co2: r.cloudflare.carbon.estimated_emissions_kg_co2e,
      esg: r.cloudflare.esg.index, sim: !!(r.aws.simulated) });
    try { sessionStorage.setItem(HK, JSON.stringify(h.slice(-20))); } catch (_) { /* armazenamento indisponível */ }
    renderHist();
  }
  function renderHist() {
    const h = loadHist();
    $('hist').innerHTML = h.length ? '<tr><th>Hora</th><th>Cultura</th><th>Área (m²)</th><th>Água (L)</th><th>Custo</th><th>kWh</th><th>kg CO₂e</th><th>ESG</th><th>Origem</th></tr>'
      + h.map((x) => `<tr><td>${esc(x.t)}</td><td>${esc(x.crop)}</td><td>${num(x.area, 0)}</td><td>${num(x.liters, 0)}</td><td>${brl(x.cost)}</td><td>${num(x.kwh)}</td><td>${num(x.co2)}</td><td>${num(x.esg, 1)}</td><td>${x.sim ? 'Simulação local' : 'Nuvem'}</td></tr>`).join('')
      : '<tr><td>Nenhuma simulação completa nesta sessão.</td></tr>';
  }

  async function execute(start) {
    running = true; $('run').disabled = true;
    try { if (lastSingle) await runSingle(lastInputs, state, lastSingle, lastDeps, lastManual); else await runPipeline(lastInputs, state, start, lastDeps); } finally { running = false; $('run').disabled = false; render(); }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const defaults = readForm();
    $('form').addEventListener('submit', (ev) => {
      ev.preventDefault();
      const msg = validateForm(); $('formMsg').hidden = !msg; $('formMsg').textContent = msg;
      if (msg || running) return;
      lastInputs = readForm(); lastDeps = deps(); state = newState();
      lastSingle = $('only').value || null; lastManual = { water_liters: parseFloat($('isoWater').value), energy_kwh: parseFloat($('isoKwh').value) };
      if ($('mode').value === 'cloud' && !Object.values(cfg.endpoints || {}).some(Boolean))
        { $('formMsg').hidden = false; $('formMsg').textContent = 'Nenhum endpoint configurado em config.js: os módulos vão falhar. Use a simulação local para testar a interface.'; }
      execute(0);
    });
    $('mods').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-retry]'); if (!b || running || !lastInputs) return;
      lastDeps = deps(); execute(Number(b.dataset.retry));
    });
    $('reset').addEventListener('click', () => { for (const el of $('form').elements) if (el.name && el.name in defaults) el.value = defaults[el.name]; });
    $('clearHist').addEventListener('click', () => { sessionStorage.removeItem(HK); renderHist(); });
    $('mode').addEventListener('change', () => { $('modeNote').textContent = $('mode').value === 'local'
      ? 'Modo de simulação local: os cálculos ocorrem no navegador e NÃO representam a integração com as nuvens.'
      : 'As três chamadas rodam em sequência: a saída de cada serviço alimenta o próximo.'; });
    render(); renderHist();
  });
})(typeof window !== 'undefined' ? window : globalThis);
