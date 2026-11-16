---
title: "AgroSense ESG — Relatório Técnico"
---
# AgroSense ESG — Ecossistema SaaS Multicloud Integrado (Serverless & Frontend)

**Instituição:** Fatec Itapira  **Curso:** ______  **Disciplina:** Computação em Nuvem I  **Atividade:** Ecossistema SaaS Multicloud Integrado  **Grupo E — Smart Agro & Sustentabilidade**
**Integrantes:** ______  **Professor(a):** ______  **Data:** ______

## 1. Introdução e objetivos
Construir uma aplicação web que integra três funções serverless em AWS, Azure e Cloudflare Workers (no lugar do Google Cloud do enunciado; substituição a confirmar com o professor), consumidas por um frontend estático via HTTP/REST/JSON, demonstrando integração multicloud, resiliência, CORS, medição de latência e análise de custos.

## 2. Problema de negócio
Produtores precisam decidir quanto irrigar, quanto isso custa e qual o impacto de carbono. O sistema oferece uma **simulação** integrada dessas três dimensões.

## 3. Arquitetura multicloud
Fluxo: usuário → frontend hospedado → AWS Lambda → Azure Functions → Cloudflare Workers → dashboard. Diagrama Mermaid em `docs/arquitetura.md` (exportar como imagem para este PDF). O frontend orquestra a sequência; nenhuma função depende de outra diretamente.

## 4. Funções serverless
| Função | Provedor | Runtime | Gatilho |
|---|---|---|---|
| Avaliador hídrico | AWS Lambda | Python 3.12 | Function URL (ou API Gateway) |
| Custo energético/hídrico | Azure Functions | Python 3.12 (modelo v2) | HTTP `/api/custo` |
| Carbono e ESG | Cloudflare Workers | JavaScript (módulo ES) | HTTP (fetch handler) |

## 5. Endpoints e JSON
Ver `docs/endpoints.md` (payloads de entrada, respostas, erros). URLs reais: ______ (preencher após o deploy).

## 6. Regras de negócio e fórmulas
- **Irrigação:** `déficit = max(0, ideal − umidade)`; `fator = 1 + max(0, T−25)×0,03`; `L/m² = déficit × 0,25 × fator`; `total = L/m² × área`. Ideais: milho 60, soja 65, café 55, tomate 70 (simulados).
- **Custo:** `kWh = kW × h` (ponta/fora de ponta); custo = kWh × tarifa; `m³ = L/1000`; total = energia + água; validação `ponta + fora = total` (±0,01 h).
- **Carbono/ESG:** `kg CO₂e = kWh × fator`; `ha = m²/10⁴`; árvores = ⌈kg/absorção⌉ (20 kg/árvore/ano, configurável); `ESG = 0,7×nota_carbono + 0,3×nota_energia`, notas lineares de 100 a 0 em 50 kg CO₂e/ha e 200 kWh/ha; faixas ≥80/60/40.
- Todos os parâmetros são didáticos, não científicos, e aparecem no topo dos códigos.

## 7. CORS e segurança
AWS e Cloudflare: cabeçalhos `Access-Control-*` no código, controlados por `ALLOWED_ORIGIN`; Azure: CORS da plataforma. Preflight `OPTIONS` → 204. Endpoints anônimos são aceitáveis apenas na atividade (riscos: abuso, custo, ausência de autenticação). Sem segredos no frontend ou repositório.

## 8. Tratamento de erros e fallback
`try/catch`, `AbortController` por chamada (`timeoutMs`), classificação (config, rede/CORS, timeout, HTTP, resposta inválida), estados por módulo (Aguardando/Processando/Concluído/Erro/Bloqueado), preservação de resultados, retry por módulo. Modo "simulação local" explicitamente rotulado como não-nuvem.

## 9. Testes
Ver `docs/testes.md`: 34 testes automatizados (Python `unittest` e Node `node:test`) + roteiro manual. Resultados de testes manuais em nuvem: ______ (preencher).

## 10. Latência, cold start e warm start
Tabela em `docs/metricas.md` (preencher com medições). Cold e warm start dependem de provedor, plano, memória, runtime, região e ociosidade; nenhum valor é assumido neste relatório.

## 11. Comparação dos consoles e serviços
| Critério | AWS | Azure | Cloudflare |
|---|---|---|---|
| Criação da função | ______ | ______ | ______ |
| Configuração de URL/CORS | ______ | ______ | ______ |
| Logs e métricas | ______ | ______ | ______ |
| Documentação/CLI | ______ | ______ | ______ |
(Preencher com a experiência real do grupo.)

## 12. Estimativa de custos — 1 milhão de requisições/mês
Modelo, hipóteses e fórmulas em `docs/metricas.md`; valores a preencher com os preços oficiais vigentes e as durações medidas. Distinguir **estimado** de **observado**. Componentes adicionais: logs, Storage da Function App, Artifact Registry/Cloud Build, rede, API Gateway.

## 13. Conclusão
______ (síntese do grupo: o que funcionou, dificuldades, limitações, melhorias — autenticação, orquestrador, observabilidade, IaC).

## 14. Referências técnicas oficiais
Consultar e citar (com data de acesso): documentação do AWS Lambda (Function URLs, Python runtime, pricing); Azure Functions (Python v2, HTTP trigger, CORS, pricing); Cloudflare Workers (dashboard, limits, pricing); MDN (Fetch API, AbortController, CORS).

---
**Converter para PDF:** `pandoc docs/relatorio-tecnico.md -o relatorio.pdf` (ou abra no VS Code/Typora e exporte). Para o diagrama: `npx @mermaid-js/mermaid-cli -i docs/arquitetura.md` ou cole o bloco em mermaid.live e exporte PNG.
