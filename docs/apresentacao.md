# Roteiro de apresentação (≈15 min)

| Tempo | Etapa | O que mostrar |
|---|---|---|
| 0–1 | Problema e proposta | Irrigar com eficiência: quanta água, quanto custa, qual o impacto de carbono |
| 1–3 | Arquitetura multicloud | Diagrama de `docs/arquitetura.md`: FaaS em 3 nuvens + frontend PaaS; orquestração no cliente |
| 3–5 | AWS | Executar simulação; card de irrigação, L/m² e total; explicar fórmula |
| 5–7 | Azure | Saída da AWS vira entrada; kWh, ponta × fora de ponta, custo total |
| 7–9 | Cloudflare | kWh vira entrada; emissões, árvores equivalentes, índice ESG e metodologia |
| 9–10 | Latência | Tempos em ms por provedor; comentar cold × warm (tabela de `metricas.md`) |
| 10–12 | Resiliência | "Simular indisponibilidade → Azure": AWS preservada, Cloudflare bloqueada, "Tentar novamente" |
| 12–14 | Logs | CloudWatch, Application Insights/log stream, Cloud Logging mostrando a mesma chamada |
| 14–15 | Segurança, custos, limitações e conclusão | CORS ≠ autenticação; endpoints públicos; FinOps; modelo demonstrativo |

Checklist prévio: endpoints no `config.js`; CORS com a URL pública; chamada de aquecimento feita (ou mostrar o cold start de propósito); abas dos consoles abertas.

## Perguntas prováveis
- **O que é serverless/FaaS?** Execução de funções sob demanda sem gerenciar servidores; cobrança por uso. **PaaS?** Plataforma que hospeda a aplicação (aqui, o frontend estático) sem gerenciar infraestrutura.
- **Por que HTTP/REST/JSON?** Padrão interoperável entre nuvens; stateless; JSON simples de validar.
- **O que é CORS e por que quebrou?** Política do navegador: o servidor precisa autorizar a origem do frontend via cabeçalhos `Access-Control-*`, inclusive no preflight `OPTIONS`. Não é autenticação.
- **Cold × warm start?** Cold: o provedor cria/inicializa o ambiente antes de executar; warm: reutiliza ambiente. Depende de plano, runtime, ociosidade e configuração; medimos, não presumimos.
- **Fallback?** Falhas são isoladas; nunca exibimos valores falsos; o modo local é rotulado como simulação e não substitui a nuvem.
- **Permissões?** AWS: papel de execução + permissão de invocação da Function URL; Azure: nível de autorização do gatilho; Cloudflare: Worker público sem autenticação. Acesso anônimo só para teste.
- **Logs?** CloudWatch Logs, Application Insights, Cloud Logging; sem dados sensíveis nos logs.
- **FinOps?** Franquias gratuitas, duração × memória, logs e rede como custos ocultos; alarmes de orçamento; remover recursos após a avaliação.
- **Por que o frontend orquestra?** Atende ao requisito de integração entre nuvens sem backend central; trade-off: lógica de orquestração exposta e dependente do cliente (em produção, usar um orquestrador).
