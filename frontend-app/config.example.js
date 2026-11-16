// Copie para config.js e preencha com as URLs públicas reais após o deploy.
// URLs de endpoints não são segredos, mas NUNCA coloque chaves de API ou credenciais aqui.
window.AGROSENSE_CONFIG = {
  endpoints: {
    aws: "",    // ex.: URL da Function URL da Lambda (https://<id>.lambda-url.<regiao>.on.aws/)
    azure: "",  // ex.: https://<function-app>.azurewebsites.net/api/custo
    cloudflare: ""  // ex.: https://agrosense-carbono.<seu-subdominio>.workers.dev
  },
  timeoutMs: 15000 // tempo limite por chamada (cold start pode levar alguns segundos)
};
