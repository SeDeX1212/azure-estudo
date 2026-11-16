# Testes

## Automatizados (executados no desenvolvimento deste repositório)
| Componente | Comando | Resultado registrado |
|---|---|---|
| AWS | `cd aws-lambda && python -m unittest discover -s tests -v` | 11 testes OK |
| Azure | `cd azure-functions && python -m unittest discover -s tests -v` | 7 testes de regra OK; 1 teste do gatilho HTTP ignorado por falta do pacote `azure-functions` no ambiente (execute após `pip install azure-functions`) |
| Cloudflare | `cd cloudflare-workers && node --test tests/worker.test.mjs` | 4 testes OK |
| Google (original, não usado) | `cd google-functions && python -m unittest discover -s tests -v` | 8 testes OK |
| Frontend | `cd frontend-app && node --test tests/pipeline.test.js tests/render.test.js` | 16 testes OK (cadeia, falhas, isolado, interface) |

Cobertura: requisição válida; campos ausentes; tipos errados; negativos/fora de faixa; divisão por zero (área = 0); JSON inválido; códigos 200/400/405/500/204; cálculos conferidos manualmente; CORS restrito; cadeia completa; timeout; falha de conexão; erro HTTP; falha no 1º, 2º e 3º serviço; preservação de resultados; nova tentativa; modo local.

Os testes automatizados **não** substituem o teste fim a fim com endpoints reais (nenhum deploy foi feito neste desenvolvimento).

## Manuais (preencher após o deploy)
| # | Cenário | Como executar | Esperado | Observado |
|---|---|---|---|---|
| 1 | Fluxo completo | Executar simulação com valores padrão | 3 cards "Concluído", tempos em ms | |
| 2 | Falha AWS | "Simular indisponibilidade → AWS" | AWS erro; Azure/Cloudflare bloqueados; KPIs vazios | |
| 3 | Falha Azure | idem Azure | Irrigação preservada; Cloudflare bloqueada | |
| 4 | Falha Cloudflare | idem Cloudflare | Irrigação e custos preservados | |
| 5 | Timeout | `timeoutMs: 1` em `config.js` | Erro "Tempo limite…" | |
| 6 | Retry | Remover falha e clicar em "Tentar novamente" | Módulo conclui; anteriores intactos | |
| 7 | Validação | Horas de ponta + fora ≠ total | Mensagem antes de chamar a nuvem | |
| 8 | CORS | Abrir pela URL pública | Sem erro de CORS no console | |
