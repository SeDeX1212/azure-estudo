# Azure Static Web Apps — API gerenciada (alternativa gratuita ao Function App Flex Consumption)

Usada quando a assinatura é **teste gratuito** e o Azure bloqueia o Flex Consumption. A função é a mesma de `azure-functions/` (mesma regra, mesmo JSON), no modelo clássico (`function.json`) com Python 3.11, versão que a documentação do Static Web Apps lista como suportada.

- `api/custo/` — função HTTP `POST /api/custo` (`__init__.py`, `function.json`, `calculo.py`)
- `api/host.json`, `api/requirements.txt`
- `../frontend-app/staticwebapp.config.json` — fixa `apiRuntime` em `python:3.11`

O Static Web Apps hospeda também o frontend (`frontend-app`), então o site e a API ficam no mesmo endereço `https://<nome>.azurestaticapps.net`.

## Deploy (portal, sem terminal)
1. Suba o repositório para o GitHub (pastas `frontend-app` e `azure-swa` na raiz).
2. Portal Azure → Criar um recurso → **Static Web App** → plano **Free**.
3. Origem **GitHub**; *Build presets*: **Custom**; *App location* `/frontend-app`; *Api location* `/azure-swa/api`; *Output location* em branco.
4. Acompanhe o GitHub Actions até ficar verde. A URL aparece na visão geral do recurso.

## Testes locais
`cd api && python -m unittest discover -s tests -v` (usa um stub de `azure.functions` se o pacote não estiver instalado).

## CORS
Código envia os cabeçalhos. Defina `ALLOWED_ORIGIN` em *Settings → Environment variables / Application settings* (lista separada por vírgulas). Sem a variável vale `*`.

## Limpeza
Excluir o grupo de recursos no portal.
