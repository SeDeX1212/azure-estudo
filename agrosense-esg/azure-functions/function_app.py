"""AgroSense ESG - Azure Functions (modelo de programação Python v2): gatilho HTTP /api/custo.

CORS: configurado na plataforma (az functionapp cors add) e, localmente, em
local.settings.json -> Host.CORS. O código não adiciona cabeçalhos CORS para
evitar duplicidade com a configuração da plataforma.
"""
import json
import logging

import azure.functions as func

from custo import ValidationError, calcular_custo

app = func.FunctionApp(http_auth_level=func.AuthLevel.ANONYMOUS)


def _json(status, body):
    return func.HttpResponse(json.dumps(body, ensure_ascii=False), status_code=status,
                             mimetype="application/json")


def _error(status, code, message):
    return _json(status, {"success": False, "provider": "Azure Functions", "service": "operational_cost",
                          "error": {"code": code, "message": message}})


@app.route(route="custo", methods=["GET", "POST", "OPTIONS"])
def custo(req: func.HttpRequest) -> func.HttpResponse:
    if req.method == "OPTIONS":
        return func.HttpResponse(status_code=204)
    if req.method != "POST":
        return _error(405, "METHOD_NOT_ALLOWED", "Use o método POST.")
    try:
        payload = req.get_json()
    except ValueError:
        return _error(400, "INVALID_JSON", "Corpo da requisição não é um JSON válido.")
    try:
        return _json(200, calcular_custo(payload))
    except ValidationError as exc:
        return _error(400, "VALIDATION_ERROR", str(exc))
    except Exception:  # noqa: BLE001 - sem detalhes sensíveis nos logs
        logging.exception("Erro interno inesperado no estimador de custo")
        return _error(500, "INTERNAL_ERROR", "Erro interno ao calcular os custos.")
