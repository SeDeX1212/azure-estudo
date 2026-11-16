/* AgroSense ESG - Cloudflare Workers: substituto da função do Google Cloud (carbono e índice ESG).
 * Mesma regra de negócio e mesmo contrato JSON de google-functions/esg.py.
 * Modelo ACADÊMICO e demonstrativo: não é medição científica, crédito de carbono nem certificação ESG.
 * CORS: variável ALLOWED_ORIGIN (lista separada por vírgulas; padrão "*" só para desenvolvimento). */
 
// ============ PARÂMETROS DEMONSTRATIVOS (ajustáveis) ============
const DEFAULT_ABSORPTION = 20.0;      // kg CO2e por árvore por ano (varia com espécie, clima, idade, período)
const REF_CARBON_INTENSITY = 50.0;    // kg CO2e/ha que zera a nota de carbono
const REF_ENERGY_INTENSITY = 200.0;   // kWh/ha que zera a nota de energia
const W_CARBON = 0.7, W_ENERGY = 0.3;
const CLASSES = [[80, 'Excelente'], [60, 'Boa'], [40, 'Moderada'], [0, 'Crítica']];
// =================================================================
const PROVIDER = 'Cloudflare Workers';
const LIMITATIONS = 'O fator de emissão da eletricidade depende da matriz energética e do período adotados. A absorção de carbono por árvores varia com espécie, clima, idade e tempo considerado. Árvores equivalentes não são créditos de carbono certificados.';
const DISCLAIMER = 'Indicadores estimados para fins educacionais, sem certificação ambiental.';
 
class ValidationError extends Error {}
 
function num(p, field, min, max, { required = true, def = null, positive = false } = {}) {
  const v = p[field];
  if (v === undefined || v === null) { if (required) throw new ValidationError(`Campo obrigatório ausente: ${field}.`); return def; }
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new ValidationError(`O campo ${field} deve ser numérico.`);
  if (v < min || (positive && v <= min) || v > max) throw new ValidationError(`O campo ${field} deve estar entre ${min}${positive ? ' (exclusivo)' : ''} e ${max}.`);
  return v;
}
function validate(p) {
  if (p === null || typeof p !== 'object' || Array.isArray(p)) throw new ValidationError('O corpo da requisição deve ser um objeto JSON.');
  return {
    energy: num(p, 'energy_kwh', 0, 1e6),
    area: num(p, 'planted_area_m2', 0, 1e7, { positive: true }),
    factor: num(p, 'carbon_factor_kg_per_kwh', 0, 2),
    absorption: num(p, 'absorption_kg_per_tree_year', 0, 1000, { required: false, def: DEFAULT_ABSORPTION, positive: true }),
  };
}
const r2 = (x) => Math.round(x * 100) / 100;
const r1 = (x) => Math.round(x * 10) / 10;
const classify = (i) => CLASSES.find(([f]) => i >= f)[1];
 
function calcular(payload) {
  const d = validate(payload);
  const emissions = d.energy * d.factor, ha = d.area / 10000, treesExact = emissions / d.absorption;
  const ci = emissions / ha, ei = d.energy / ha;
  const cs = 100 * Math.max(0, 1 - ci / REF_CARBON_INTENSITY), es = 100 * Math.max(0, 1 - ei / REF_ENERGY_INTENSITY);
  const index = r1(W_CARBON * cs + W_ENERGY * es);
  return {
    success: true, provider: PROVIDER, service: 'carbon_esg',
    carbon: { energy_kwh: d.energy, emission_factor: d.factor, estimated_emissions_kg_co2e: r2(emissions),
      carbon_intensity_kg_per_ha: r2(ci), energy_intensity_kwh_per_ha: r2(ei) },
    land: { planted_area_m2: d.area, planted_area_hectares: Math.round(ha * 1e4) / 1e4 },
    compensation: { estimated_trees_equivalent: emissions > 0 ? Math.ceil(treesExact - 1e-9) : 0,
      trees_exact: Math.round(treesExact * 1e3) / 1e3, absorption_factor_kg_per_tree_year: d.absorption },
    esg: { index, classification: classify(index), sub_scores: { carbon: r1(cs), energy: r1(es) },
      weights: { carbon: W_CARBON, energy: W_ENERGY },
      methodology: `Índice = 70% nota de carbono + 30% nota de energia; cada nota cai linearmente de 100 a 0 até ${REF_CARBON_INTENSITY} kg CO2e/ha e ${REF_ENERGY_INTENSITY} kWh/ha. Faixas: >=80 Excelente, >=60 Boa, >=40 Moderada, <40 Crítica.`,
      limitations: LIMITATIONS },
    disclaimer: DISCLAIMER,
  };
}
 
function corsHeaders(origin, env) {
  const allowed = String((env && env.ALLOWED_ORIGIN) || '*').split(',').map((s) => s.trim()).filter(Boolean);
  const h = { 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '3600' };
  if (allowed.includes('*')) h['Access-Control-Allow-Origin'] = '*';
  else if (origin && allowed.includes(origin)) { h['Access-Control-Allow-Origin'] = origin; h['Vary'] = 'Origin'; }
  return h;
}
function reply(status, body, origin, env) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin, env) } });
}
const fail = (status, code, message, origin, env) =>
  reply(status, { success: false, provider: PROVIDER, service: 'carbon_esg', error: { code, message } }, origin, env);
 
async function handle(request, env) {
  const origin = request.headers.get('Origin');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin, env) });
  if (request.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED', 'Use o método POST.', origin, env);
  let payload;
  try { payload = await request.json(); } catch (_) { return fail(400, 'INVALID_JSON', 'Corpo da requisição não é um JSON válido.', origin, env); }
  try { return reply(200, calcular(payload), origin, env); }
  catch (e) {
    if (e instanceof ValidationError) return fail(400, 'VALIDATION_ERROR', e.message, origin, env);
    console.error('Erro interno inesperado na calculadora de carbono');
    return fail(500, 'INTERNAL_ERROR', 'Erro interno ao calcular carbono e ESG.', origin, env);
  }
}
 
export default { fetch: handle, calcular, ValidationError }; // extras usados só nos testes
 