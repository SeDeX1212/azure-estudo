// Copie para config.js e preencha com as URLs públicas reais após o deploy.
// URLs de endpoints não são segredos, mas NUNCA coloque chaves de API ou credenciais aqui.
window.AGROSENSE_CONFIG = {
  endpoints: {
    aws: "https://nwfht26jqvjpunsqjjolmvbxzm0kexzn.lambda-url.us-east-2.on.aws/",    // ex.: URL da Function URL da Lambda (https://<id>.lambda-url.<regiao>.on.aws/)
    azure: "",  // ex.: https://<function-app>.azurewebsites.net/api/custo
    google: "https://agrosense-carbono.paulojorgelemosilva.workers.dev"  // ex.: URL HTTPS da função no Cloud Run (https://<servico>-<hash>-<regiao>.a.run.app)
  },
  timeoutMs: 15000 // tempo limite por chamada (cold start pode levar alguns segundos)
};
