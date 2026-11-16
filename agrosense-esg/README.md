# AgroSense ESG — Monitoramento Agrícola Inteligente e Sustentável

SaaS acadêmico multicloud (Serverless + Frontend) da disciplina **Computação em Nuvem I — Fatec Itapira**. Grupo E — Smart Agro & Sustentabilidade.

O usuário informa dados **simulados** de sensores e da operação; o frontend encadeia três funções independentes em nuvens diferentes e exibe tudo em um dashboard.

## Arquitetura
```
Usuário → Frontend estático (PaaS) → AWS Lambda (irrigação) → Azure Functions (custos) → Google Cloud Run Functions (carbono/ESG) → Dashboard
```
Detalhes e diagrama Mermaid: [`docs/arquitetura.md`](docs/arquitetura.md).

## Objetivos acadêmicos
Integrar FaaS de três provedores via HTTP/REST/JSON; tratar CORS, timeouts e falhas parciais; medir latência; comparar consoles e custos; documentar e apresentar a solução.

## Estrutura
```
aws-lambda/        lambda_function.py, tests/, README (deploy)
azure-functions/   function_app.py (adaptador), custo.py (regras), host.json, local.settings.example.json, tests/
google-functions/  main.py (adaptador), esg.py (regras), tests/
frontend-app/      index.html, styles.css, app.js, config.example.js, config.js, tests/pipeline.test.js
docs/              arquitetura, endpoints, testes, métricas, apresentação, relatório técnico
```
Arquivos além dos exigidos: `custo.py` e `esg.py` (lógica pura, testável sem SDK), `config.js` (URLs; copie de `config.example.js`), `frontend-app/tests/` (testes Node) e `docs/relatorio-tecnico.md`.

## Funções
| Provedor | Função | Entrada principal | Saída principal |
|---|---|---|---|
| AWS Lambda | Necessidade hídrica | umidade, temperatura, cultura, área | L/m², litros totais, nível |
| Azure Functions | Custo energético e hídrico | litros, potência, horas, tarifas | kWh, custos, total (BRL) |
| Google Cloud Run Functions | Carbono e ESG | kWh, área, fator de emissão | kg CO₂e, árvores equivalentes, índice 0–100 |

Exemplos de payload e `curl`/PowerShell: [`docs/endpoints.md`](docs/endpoints.md).

## Como rodar
**Testes** (Python 3.12 e Node 18+, sem dependências extras):
```bash
for d in aws-lambda azure-functions google-functions; do (cd $d && python -m unittest discover -s tests); done
(cd frontend-app && node --test tests/pipeline.test.js)
```
**Frontend local:** `cd frontend-app && cp config.example.js config.js && python -m http.server 8080` → http://localhost:8080 (use "Simulação local" enquanto não houver endpoints).

## Deploy (ordem sugerida)
1. [`aws-lambda/README.md`](aws-lambda/README.md) · 2. [`azure-functions/README.md`](azure-functions/README.md) · 3. [`google-functions/README.md`](google-functions/README.md) · 4. Preencher `frontend-app/config.js` · 5. [`frontend-app/README.md`](frontend-app/README.md) (publicar) · 6. Incluir a URL pública no CORS das três funções · 7. Testar a URL pública e a resiliência.

Pré-requisitos e custos: cada nuvem exige conta própria; não presuma créditos gratuitos. Confira preços e franquias nas páginas oficiais.

## Links de implantação (preencher)
| Item | URL |
|---|---|
| Frontend | |
| AWS Lambda | |
| Azure Functions | |
| Google Cloud Run Functions | |

## Integrantes (preencher)
| Nome | RA |
|---|---|
| | |

## Segurança e limitações
- Endpoints **públicos/anônimos** servem apenas ao teste acadêmico: qualquer um com a URL pode chamá-los e gerar custo. Produção exigiria autenticação (IAM/Cognito, chaves de função, IAM do Cloud Run), WAF/limites de taxa e alarmes de orçamento.
- CORS restringe navegadores, **não** autentica clientes. Defina `ALLOWED_ORIGIN` (AWS/Google) e o CORS da plataforma (Azure) com as origens exatas; `*` só em desenvolvimento.
- Sem segredos no repositório; logs sem dados do usuário.
- Modelos **demonstrativos**: parâmetros agronômicos, tarifas e índice ESG são simulados, não validados cientificamente nem certificados; árvores equivalentes não são créditos de carbono.
- A orquestração no cliente é uma escolha didática; em produção usaria-se um orquestrador/backend.
- Este repositório foi desenvolvido e testado **sem** deploy real: latências, custos observados e evidências de nuvem devem ser registrados por vocês em `docs/metricas.md`.

## Limpeza dos recursos de nuvem
Ao final da avaliação execute a seção "Limpeza" de cada README de função (Lambda + URL + logs + papel IAM; `az group delete`; `gcloud functions delete` e artefatos) e remova o projeto de hospedagem do frontend.
