# Endpoints, payloads e exemplos

Todos: `POST`, `Content-Type: application/json`. Erros: `{"success":false,"provider":"…","service":"…","error":{"code":"VALIDATION_ERROR|INVALID_JSON|METHOD_NOT_ALLOWED|INTERNAL_ERROR","message":"…"}}`. Substitua `$AWS_URL`, `$AZURE_URL`, `$GCP_URL` pelas URLs reais.

## AWS — irrigação
```bash
curl -s -X POST "$AWS_URL" -H "Content-Type: application/json" -d '{"soil_moisture":25,"temperature":32,"crop_type":"milho","area_m2":1000}'
```
```powershell
Invoke-RestMethod -Method Post -Uri $env:AWS_URL -ContentType "application/json" -Body '{"soil_moisture":25,"temperature":32,"crop_type":"milho","area_m2":1000}'
```
Resposta (valores calculados pelo código atual, verificados nos testes):
```json
{"success":true,"provider":"AWS Lambda","service":"irrigation",
 "input":{"soil_moisture":25.0,"temperature":32.0,"crop_type":"milho","area_m2":1000.0},
 "irrigation":{"water_liters_per_m2":10.59,"total_water_liters":10587.5,"moisture_deficit_pct":35.0,"ideal_moisture_pct":60.0,"temperature_factor":1.21,"need_level":"Alta","message":"Necessidade hídrica estimada com base nos parâmetros simulados."},
 "disclaimer":"Estimativa acadêmica baseada em parâmetros simulados; não substitui recomendação agronômica profissional."}
```

## Azure — custos (`/api/custo`)
```bash
curl -s -X POST "$AZURE_URL" -H "Content-Type: application/json" -d '{"water_liters":10587.5,"pump_power_kw":2.2,"operating_hours":3,"peak_hours":1,"off_peak_hours":2,"electricity_rate_peak":1.20,"electricity_rate_off_peak":0.65,"water_rate_per_m3":5.00}'
```
Com `water_liters` = 8500 (verificado nos testes): energia 6,6 kWh (ponta 2,2 / fora 4,4), R$ 2,64 + R$ 2,86 = R$ 5,50; água 8,5 m³ = R$ 42,50; total **R$ 48,00**. Com 10 587,5 L a água custa R$ 52,94.

## Google — carbono e ESG
```bash
curl -s -X POST "$GCP_URL" -H "Content-Type: application/json" -d '{"energy_kwh":6.6,"planted_area_m2":1000,"carbon_factor_kg_per_kwh":0.08}'
```
Resposta resumida (verificada nos testes): `estimated_emissions_kg_co2e` 0,53; `planted_area_hectares` 0,1; `estimated_trees_equivalent` 1 (absorção 20 kg/árvore/ano); `esg.index` 82,7 → "Excelente" (nota carbono 89,4; nota energia 67,0). Campo opcional: `absorption_kg_per_tree_year`.

## Casos de erro para demonstração
```bash
curl -i -X POST "$AWS_URL" -H "Content-Type: application/json" -d '{"soil_moisture":150,"temperature":32,"crop_type":"milho","area_m2":1000}'   # 400
curl -i -X GET "$AWS_URL"                                                                                         # 405
curl -i -X OPTIONS "$AWS_URL" -H "Origin: http://localhost:8080" -H "Access-Control-Request-Method: POST"           # 204 + CORS
```
