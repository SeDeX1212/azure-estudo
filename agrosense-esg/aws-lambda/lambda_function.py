"""AgroSense ESG - AWS Lambda: avaliador de necessidade hídrica.

Estimativa ACADÊMICA com parâmetros SIMULADOS. Não é recomendação agronômica
nem modelo científico validado.

Fórmula (determinística):
    deficit_pct      = max(0, umidade_ideal(cultura) - umidade_atual)
    base_l_m2        = deficit_pct * LITERS_PER_M2_PER_MOISTURE_POINT
    fator_temp       = 1 + max(0, temperatura - REFERENCE_TEMPERATURE_C) * TEMPERATURE_FACTOR_PER_DEGREE
    litros_por_m2    = base_l_m2 * fator_temp
    litros_totais    = litros_por_m2 * area_m2
"""
import base64
import json
import os
import unicodedata

PROVIDER = "AWS Lambda"
SERVICE = "irrigation"

# ============ PARÂMETROS SIMULADOS (ajustáveis) ============
IDEAL_MOISTURE_PCT = {"milho": 60.0, "soja": 65.0, "cafe": 55.0, "tomate": 70.0}
LITERS_PER_M2_PER_MOISTURE_POINT = 0.25   # L/m² por ponto percentual de déficit
REFERENCE_TEMPERATURE_C = 25.0            # acima disso a demanda aumenta
TEMPERATURE_FACTOR_PER_DEGREE = 0.03      # +3% por °C acima da referência
NEED_LEVEL_LIMITS = [(3.0, "Baixa"), (7.0, "Moderada")]  # L/m²; acima = "Alta"
MAX_AREA_M2 = 10_000_000
# ============================================================

DISCLAIMER = "Estimativa acadêmica baseada em parâmetros simulados; não substitui recomendação agronômica profissional."


class ValidationError(ValueError):
    pass


def normalize_crop(value):
    text = unicodedata.normalize("NFKD", str(value).strip().lower())
    return "".join(c for c in text if not unicodedata.combining(c))


def _number(payload, field, low, high, low_exclusive=False):
    if field not in payload or payload[field] is None:
        raise ValidationError(f"Campo obrigatório ausente: {field}.")
    value = payload[field]
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValidationError(f"O campo {field} deve ser numérico.")
    if value != value or value in (float("inf"), float("-inf")):
        raise ValidationError(f"O campo {field} deve ser um número finito.")
    if (value <= low if low_exclusive else value < low) or value > high:
        op = ">" if low_exclusive else ">="
        raise ValidationError(f"O campo {field} deve estar entre {low} ({op}) e {high}.")
    return float(value)


def validate(payload):
    if not isinstance(payload, dict):
        raise ValidationError("O corpo da requisição deve ser um objeto JSON.")
    soil = _number(payload, "soil_moisture", 0, 100)
    temp = _number(payload, "temperature", -10, 60)
    area = _number(payload, "area_m2", 0, MAX_AREA_M2, low_exclusive=True)
    crop_raw = payload.get("crop_type")
    if crop_raw is None:
        raise ValidationError("Campo obrigatório ausente: crop_type.")
    if not isinstance(crop_raw, str):
        raise ValidationError("O campo crop_type deve ser texto.")
    crop = normalize_crop(crop_raw)
    if crop not in IDEAL_MOISTURE_PCT:
        raise ValidationError("Cultura não suportada. Use: " + ", ".join(sorted(IDEAL_MOISTURE_PCT)) + ".")
    return {"soil_moisture": soil, "temperature": temp, "crop_type": crop, "area_m2": area}


def need_level(liters_per_m2):
    if liters_per_m2 <= 0:
        return "Nenhuma"
    for limit, label in NEED_LEVEL_LIMITS:
        if liters_per_m2 < limit:
            return label
    return "Alta"


def calculate(data):
    ideal = IDEAL_MOISTURE_PCT[data["crop_type"]]
    deficit = max(0.0, ideal - data["soil_moisture"])
    temp_factor = 1 + max(0.0, data["temperature"] - REFERENCE_TEMPERATURE_C) * TEMPERATURE_FACTOR_PER_DEGREE
    per_m2 = deficit * LITERS_PER_M2_PER_MOISTURE_POINT * temp_factor
    return {
        "water_liters_per_m2": round(per_m2, 2),
        "total_water_liters": round(per_m2 * data["area_m2"], 2),
        "moisture_deficit_pct": round(deficit, 2),
        "ideal_moisture_pct": ideal,
        "temperature_factor": round(temp_factor, 3),
        "need_level": need_level(per_m2),
        "message": "Necessidade hídrica estimada com base nos parâmetros simulados.",
    }


def process(payload):
    data = validate(payload)
    return {"success": True, "provider": PROVIDER, "service": SERVICE,
            "input": data, "irrigation": calculate(data), "disclaimer": DISCLAIMER}


def cors_headers(request_origin):
    allowed = [o.strip() for o in os.environ.get("ALLOWED_ORIGIN", "*").split(",") if o.strip()]
    headers = {"Access-Control-Allow-Methods": "POST, OPTIONS",
               "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "3600"}
    if "*" in allowed:
        headers["Access-Control-Allow-Origin"] = "*"
    elif request_origin in allowed:
        headers["Access-Control-Allow-Origin"] = request_origin
        headers["Vary"] = "Origin"
    return headers


def _reply(status, body, origin):
    headers = {"Content-Type": "application/json", **cors_headers(origin)}
    return {"statusCode": status, "headers": headers, "body": json.dumps(body, ensure_ascii=False)}


def _error(status, code, message, origin):
    return _reply(status, {"success": False, "provider": PROVIDER, "service": SERVICE,
                           "error": {"code": code, "message": message}}, origin)


def lambda_handler(event, context=None):
    """Compatível com Function URL (payload v2) e API Gateway (HTTP API/REST)."""
    headers = {k.lower(): v for k, v in (event.get("headers") or {}).items()}
    origin = headers.get("origin")
    method = (event.get("requestContext", {}).get("http", {}).get("method")
              or event.get("httpMethod") or "").upper()
    if method == "OPTIONS":
        return {"statusCode": 204, "headers": cors_headers(origin), "body": ""}
    if method != "POST":
        return _error(405, "METHOD_NOT_ALLOWED", "Use o método POST.", origin)
    try:
        raw = event.get("body") or ""
        if event.get("isBase64Encoded"):
            raw = base64.b64decode(raw).decode("utf-8")
        payload = json.loads(raw)
    except (ValueError, UnicodeDecodeError):
        return _error(400, "INVALID_JSON", "Corpo da requisição não é um JSON válido.", origin)
    try:
        return _reply(200, process(payload), origin)
    except ValidationError as exc:
        return _error(400, "VALIDATION_ERROR", str(exc), origin)
    except Exception:  # noqa: BLE001 - não vazar detalhes internos nem dados do usuário
        print("Erro interno inesperado na função de irrigação")
        return _error(500, "INTERNAL_ERROR", "Erro interno ao calcular a irrigação.", origin)
