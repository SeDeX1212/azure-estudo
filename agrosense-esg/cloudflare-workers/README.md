# Cloudflare Workers — alternativa à função do Google Cloud

Mesma regra de negócio e mesmo contrato JSON de `google-functions` (emissões, árvores equivalentes, índice ESG 0–100). A resposta traz `provider: "Cloudflare Workers (substitui o Google Cloud)"`.
**Atenção acadêmica:** o enunciado pede AWS, Azure e Google Cloud. Use esta alternativa só com a aprovação do professor e registre a troca no relatório.

## Criar pelo painel web (dash.cloudflare.com)
1. Crie uma conta gratuita e abra **Workers & Pages → Create** (Criar aplicativo) → **Start with Hello World!** (começar com Hello World).
2. Nome: `agrosense-carbono` → **Deploy**.
3. Clique em **Edit code**, apague o código de exemplo, cole o conteúdo de `worker.js` e clique em **Deploy**.
4. Em **Settings → Variables and Secrets → Add**, tipo **Text**, nome `ALLOWED_ORIGIN`, valor `http://localhost:8080` (depois acrescente a URL pública do frontend, separada por vírgula). Salve e implante.
5. A URL aparece em **Settings → Domains & Routes** (`https://agrosense-carbono.<subdominio>.workers.dev`). Copie para `frontend-app/config.js` (`endpoints.google`).
6. Opcional: em `config.js` adicione `providerLabels: { google: "Cloudflare Workers" }`.

## Testar
```bash
curl -s -X POST "$URL" -H "Content-Type: application/json" -d '{"energy_kwh":6.6,"planted_area_m2":1000,"carbon_factor_kg_per_kwh":0.08}'
```
Esperado: emissões 0,53 kg, 1 árvore equivalente, índice 82,7 ("Excelente").
Testes locais: `node --test tests/worker.test.mjs`.

## Observações
- O plano gratuito tem limites diários de requisições e de tempo de CPU; confirme os valores vigentes na documentação oficial (Workers → Limits).
- URL pública e anônima: qualquer pessoa pode chamá-la. Serve só para o teste acadêmico.
- Logs: **Observability/Logs** do Worker no painel. Limpeza: **Settings → Delete**.
