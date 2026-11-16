"""AgroSense ESG - Google Cloud Run Functions (HTTP): entry point `carbon_esg`.

CORS é tratado no código: defina ALLOWED_ORIGIN (lista separada por vírgulas; padrão "*" apenas para desenvolvimento).
"""
import json
import logging
import os

import functions_framework

from esg import ValidationError, calcular_carbono_esg

PROVIDER = "Google Cloud Run Functions"


def cors_headers(origin):
    allowed = [o.strip() for o in os.environ.get("ALLOWED_ORIGIN", "*").split(",") if o.strip()]
    headers = {"Access-Control-Allow-Methods": "POST, OPTIONS",
               "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "3600"}
    if "*" in allowed:
        headers["Access-Control-Allow-Origin"] = "*"
    elif origin in allowed:
        headers["Access-Control-Allow-Origin"] = origin
        headers["Vary"] = "Origin"
    return headers


def _reply(status, body, origin):
    return json.dumps(body, ensure_ascii=False), status, {"Content-Type": "application/json", **cors_headers(origin)}


def _error(status, code, message, origin):
    return _reply(status, {"success": False, "provider": PROVIDER, "service": "carbon_esg",
                           "error": {"code": code, "message": message}}, origin)


@functions_framework.http
def carbon_esg(request):
    origin = request.headers.get("Origin")
    if request.method == "OPTIONS":
        return "", 204, cors_headers(origin)
    if request.method != "POST":
        return _error(405, "METHOD_NOT_ALLOWED", "Use o método POST.", origin)
    payload = request.get_json(silent=True)
    if payload is None:
        return _error(400, "INVALID_JSON", "Corpo da requisição não é um JSON válido.", origin)
    try:
        return _reply(200, calcular_carbono_esg(payload), origin)
    except ValidationError as exc:
        return _error(400, "VALIDATION_ERROR", str(exc), origin)
    except Exception:  # noqa: BLE001 - sem dados do usuário nos logs
        logging.exception("Erro interno inesperado na calculadora de carbono")
        return _error(500, "INTERNAL_ERROR", "Erro interno ao calcular carbono e ESG.", origin)
