# Azure Functions — estimador de custo energético e hídrico

Python 3.12, modelo de programação v2, rota `POST /api/custo`. A lógica fica em `custo.py` (testável sem o SDK do Azure); `function_app.py` é o adaptador HTTP.
As tarifas são **valores informados na requisição (demonstrativos)**, não tarifas oficiais.

## Regras
`kWh = kW × horas` (total, ponta e fora de ponta); custo de cada período = kWh × tarifa; `m³ = litros / 1000`; custo hídrico = m³ × tarifa. Valores arredondados a 2 casas; o total é a soma das parcelas já arredondadas. A soma `peak_hours + off_peak_hours` deve igualar `operating_hours` (tolerância de 0,01 h). Respostas: `200`, `400`, `405`, `500`.

## Testes locais
```bash
cd azure-functions && python -m unittest discover -s tests -v   # testes do gatilho HTTP exigem: pip install azure-functions
```

## Execução local (Azure Functions Core Tools v4)
```bash
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp local.settings.example.json local.settings.json  # ajuste Host.CORS para a origem do frontend
func start                                           # http://localhost:7071/api/custo
```
(`AzureWebJobsStorage` = `UseDevelopmentStorage=true` requer o emulador Azurite; alternativamente informe uma connection string de Storage.)

## Deploy (Azure CLI)
Pré-requisitos: assinatura Azure ativa (não presuma créditos gratuitos), `az login`, Core Tools v4.
```bash
RG=rg-agrosense; LOC=brazilsouth; ST=stagro$RANDOM; APP=agrosense-custo-$RANDOM
az group create -n $RG -l $LOC
az storage account create -n $ST -g $RG -l $LOC --sku Standard_LRS
az functionapp create -g $RG -n $APP --storage-account $ST --consumption-plan-location $LOC \
  --runtime python --runtime-version 3.12 --functions-version 4 --os-type Linux
cd azure-functions && func azure functionapp publish $APP
az functionapp cors add -g $RG -n $APP --allowed-origins http://localhost:8080 https://SEU-APP.vercel.app
```
URL: `https://$APP.azurewebsites.net/api/custo`. O gatilho é `AuthLevel.ANONYMOUS` (teste acadêmico). **Atenção:** a Microsoft vem recomendando o plano *Flex Consumption* para novas aplicações Linux; se o comando acima for recusado na sua região/assinatura, veja `az functionapp create --help` e a documentação oficial (`--flexconsumption-location`) e ajuste.

**CORS:** configurado na plataforma (`az functionapp cors add`) e, localmente, em `Host.CORS`. O código não emite cabeçalhos CORS, evitando duplicidade. Portal: Function App → API → CORS.

**Logs/métricas:** portal → Function App → Functions → custo → Monitor/Invocations (Application Insights), ou `func azure functionapp logstream $APP`.

## Teste
```bash
curl -s -X POST "https://$APP.azurewebsites.net/api/custo" -H "Content-Type: application/json" \
  -d '{"water_liters":8500,"pump_power_kw":2.2,"operating_hours":3,"peak_hours":1,"off_peak_hours":2,"electricity_rate_peak":1.20,"electricity_rate_off_peak":0.65,"water_rate_per_m3":5.00}'
```

## Limpeza
`az group delete -n rg-agrosense --yes --no-wait` (remove Function App, plano, Storage e Application Insights do grupo).
