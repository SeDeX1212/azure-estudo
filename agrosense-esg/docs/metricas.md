# Métricas (preencher com medições reais)

Nenhum valor foi medido ainda. Registre o tempo exibido em cada card (ms, medido no navegador com `performance.now()`: inclui rede + processamento). Faça ao menos 10 execuções por função: a primeira após ficar ociosa (cold start provável) e as seguintes em sequência (warm start provável). Cold/warm start dependem de provedor, plano, runtime, memória, região, tamanho do pacote e tempo de ociosidade — não generalize.

| Função | Região | Config. (memória/plano) | 1ª chamada ociosa (ms) | Mediana warm (ms) | p95 warm (ms) | Data/hora | Observações |
|---|---|---|---|---|---|---|---|
| AWS Lambda | | | | | | | |
| Azure Functions | | | | | | | |
| Google Cloud Run Functions | | | | | | | |
| Cadeia completa (soma + frontend) | — | — | | | | | |

## Estimativa de custo — 1 milhão de requisições/mês (modelo; **preencher com preços oficiais vigentes**)
Hipóteses a registrar: 1 000 000 invocações/mês por função; duração média = ____ ms (medida acima); memória = ____ MB; sem tráfego de saída relevante (respostas < 2 KB); logs mínimos.

| Componente | Fórmula | AWS Lambda | Azure Functions (Consumption/Flex) | Google Cloud Run Functions |
|---|---|---|---|---|
| Requisições | (invocações − franquia gratuita) × preço por milhão | | | |
| Computação | invocações × duração(s) × memória(GB) × preço por GB‑s (menos franquia) | | | |
| Adicionais | logs (CloudWatch/App Insights/Cloud Logging), Storage da Function App, Artifact Registry/Cloud Build, saída de rede, API Gateway se usado | | | |
| **Total estimado** | | | | |

Preços e franquias mudam por região e ao longo do tempo: consulte as páginas oficiais de preço de cada serviço e anote data e URL da consulta. Separe sempre **estimado** (esta tabela) de **observado** (fatura/console de custos).
