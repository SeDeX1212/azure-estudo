# Frontend — AgroSense ESG (SPA estática)

HTML + CSS + JavaScript puro (sem build, sem dependências, gráficos em CSS/SVG). Encadeia AWS → Azure → Cloudflare Workers por `fetch`, mede o tempo com `performance.now()`, aplica timeout por chamada (`AbortController`), isola falhas e permite nova tentativa por módulo.

## Executar localmente
```bash
cd frontend-app
cp config.example.js config.js     # preencha as três URLs
python -m http.server 8080         # abra http://localhost:8080
```
Sem endpoints, use **Modo → Simulação local**: roda no navegador, aparece rotulado como "Simulação local, não é nuvem" e serve apenas para testar a interface.

## Configuração
`config.js` define `endpoints.aws|azure|cloudflare` e `timeoutMs`. URLs públicas não são segredos; **nunca** coloque chaves ou credenciais aqui. Em produção commite o `config.js` com as URLs finais (ou gere-o no build da plataforma).

## Publicar
- **Vercel:** `npx vercel --prod` dentro de `frontend-app` (ou importe o repositório com *Root Directory* = `frontend-app`, sem build command).
- **Netlify:** arraste a pasta `frontend-app` em app.netlify.com/drop, ou *Publish directory* = `frontend-app`.
- **GitHub Pages:** publique a pasta `frontend-app` (ex.: Actions ou branch `gh-pages`).

Depois do deploy, adicione a URL de produção ao CORS das três funções (`ALLOWED_ORIGIN`, `az functionapp cors add`).

## Testes
`node --test tests/pipeline.test.js` — cobre cadeia completa, falha em cada serviço, timeout, erro HTTP, falha de conexão, preservação de resultados, nova tentativa e modo local.

## Teste de resiliência manual
Escolha **Simular indisponibilidade de → Azure Functions** e execute: a AWS conclui, a Azure falha, a Cloudflare fica "Bloqueado". Remova a simulação e clique em **Tentar novamente** na Azure.

## Teste isolado de um módulo
Em **Executar**, escolha "Somente AWS", "Somente Azure" ou "Somente Cloudflare". O módulo roda sozinho, com os litros ou kWh digitados nos campos abaixo, e os outros ficam como "Não executado". Serve para validar cada endpoint antes de configurar os três. O resultado é marcado como teste isolado e não entra no histórico.
Compatibilidade: um `config.js` antigo com `endpoints.google` continua funcionando para o 3º serviço.
