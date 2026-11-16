# Google Cloud Run Functions — pegada de carbono e índice ESG

Python 3.12, entry point `carbon_esg` (Functions Framework). Lógica em `esg.py`, adaptador HTTP em `main.py`.
Indicadores **educacionais**: não são medição científica, créditos de carbono ou certificação ESG.

## Fórmulas (constantes ajustáveis no topo de `esg.py`)
```
emissões (kg CO2e) = energy_kwh × carbon_factor_kg_per_kwh
hectares           = planted_area_m2 / 10 000
árvores            = ⌈emissões / absorção⌉   (absorção padrão: 20 kg/árvore/ano; opcional no payload)
nota_carbono       = 100 × max(0, 1 − (emissões/ha) / 50)
nota_energia       = 100 × max(0, 1 − (kWh/ha) / 200)
índice ESG         = 0,7 × nota_carbono + 0,3 × nota_energia
faixas             ≥80 Excelente · ≥60 Boa · ≥40 Moderada · <40 Crítica
```
Limitações: o fator de emissão depende da matriz elétrica/período; a absorção por árvore varia com espécie, clima, idade e período; os pesos e referências (50 kg/ha, 200 kWh/ha) são escolhas didáticas.

## Testes e execução local
```bash
cd google-functions && python -m unittest discover -s tests -v
pip install -r requirements.txt && functions-framework --target=carbon_esg --port=8081
```

## Deploy (gcloud CLI)
Pré-requisitos: projeto GCP com faturamento ativo (as funções exigem faturamento habilitado; confirme o nível gratuito vigente), `gcloud auth login`.
```bash
gcloud config set project SEU_PROJETO
gcloud services enable cloudfunctions.googleapis.com run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com logging.googleapis.com
cd google-functions
gcloud functions deploy agrosense-carbono --gen2 --runtime=python312 --region=southamerica-east1 \
  --source=. --entry-point=carbon_esg --trigger-http --allow-unauthenticated \
  --set-env-vars ALLOWED_ORIGIN=http://localhost:8080
gcloud functions describe agrosense-carbono --gen2 --region=southamerica-east1 --format="value(serviceConfig.uri)"
```
`--allow-unauthenticated` concede `roles/run.invoker` a `allUsers` (apenas teste acadêmico). **CORS:** no código, via `ALLOWED_ORIGIN` (várias origens separadas por vírgula; ao atualizar, use `--update-env-vars`; se a vírgula causar erro, consulte `gcloud topic escaping`).

**Logs:** `gcloud functions logs read agrosense-carbono --gen2 --region=southamerica-east1` ou Cloud Logging.

## Teste
```bash
curl -s -X POST "$URL" -H "Content-Type: application/json" \
  -d '{"energy_kwh":6.6,"planted_area_m2":1000,"carbon_factor_kg_per_kwh":0.08}'
```

## Limpeza
`gcloud functions delete agrosense-carbono --gen2 --region=southamerica-east1` (ao final, remova também imagens no Artifact Registry/buckets do Cloud Build ou o projeto inteiro: `gcloud projects delete SEU_PROJETO`).
