"""AgroSense ESG - Azure Functions (modelo clássico, function.json) hospedada como API gerenciada do Azure Static Web Apps.
Rota: POST /api/custo. Lógica em calculo.py (a mesma de azure-functions/custo.py).
CORS: neste modelo o código envia os cabeçalhos; defina ALLOWED_ORIGIN (lista separada por vírgulas) nas
configurações do aplicativo. Padrão "*" apenas para desenvolvimento/atividade acadêmica."""
import json
import logging
import os

import azure.functions as func

from .calculo import ValidationError, calcular_custo

PROVIDER = "Azure Functions"


def _cors(origin):
    allowed = [o.strip() for o in os.environ.get("ALLOWED_ORIGIN", "*").split(",") if o.strip()]
    headers = {"Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type",
               "Access-Control-Max-Age": "3600"}
    if "*" in allowed:
        headers["Access-Control-Allow-Origin"] = "*"
    elif origin in allowed:
        headers["Access-Control-Allow-Origin"] = origin
        headers["Vary"] = "Origin"
    return headers


def _json(status, body, origin):
    return func.HttpResponse(json.dumps(body, ensure_ascii=False), status_code=status,
                             mimetype="application/json", headers=_cors(origin))


def _error(status, code, message, origin):
    return _json(status, {"success": False, "provider": PROVIDER, "service": "operational_cost",
                          "error": {"code": code, "message": message}}, origin)


def main(req: func.HttpRequest) -> func.HttpResponse:
    origin = req.headers.get("Origin")
    if req.method == "OPTIONS":
        return func.HttpResponse(status_code=204, headers=_cors(origin))
    if req.method != "POST":
        return _error(405, "METHOD_NOT_ALLOWED", "Use o método POST.", origin)
    try:
        payload = req.get_json()
    except ValueError:
        return _error(400, "INVALID_JSON", "Corpo da requisição não é um JSON válido.", origin)
    try:
        return _json(200, calcular_custo(payload), origin)
    except ValidationError as exc:
        return _error(400, "VALIDATION_ERROR", str(exc), origin)
    except Exception:  # noqa: BLE001 - sem dados do usuário nos logs
        logging.exception("Erro interno inesperado no estimador de custo")
        return _error(500, "INTERNAL_ERROR", "Erro interno ao calcular os custos.", origin)
