"""AgroSense ESG - lógica pura do estimador de custo energético e hídrico (sem dependência do Azure)."""

TOLERANCE_HOURS = 0.01
MAX_OPERATING_HOURS = 24
DISCLAIMER = "Tarifas informadas para simulação acadêmica; não são tarifas oficiais de concessionárias."


class ValidationError(ValueError):
    pass


def _number(payload, field, maximum=None, positive=False):
    if field not in payload or payload[field] is None:
        raise ValidationError(f"Campo obrigatório ausente: {field}.")
    value = payload[field]
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValidationError(f"O campo {field} deve ser numérico.")
    if value != value or value in (float("inf"), float("-inf")):
        raise ValidationError(f"O campo {field} deve ser um número finito.")
    if value < 0 or (positive and value <= 0):
        raise ValidationError(f"O campo {field} deve ser {'maior que zero' if positive else 'maior ou igual a zero'}.")
    if maximum is not None and value > maximum:
        raise ValidationError(f"O campo {field} deve ser menor ou igual a {maximum}.")
    return float(value)


def validate(payload):
    if not isinstance(payload, dict):
        raise ValidationError("O corpo da requisição deve ser um objeto JSON.")
    data = {
        "water_liters": _number(payload, "water_liters"),
        "pump_power_kw": _number(payload, "pump_power_kw", maximum=1000, positive=True),
        "operating_hours": _number(payload, "operating_hours", maximum=MAX_OPERATING_HOURS, positive=True),
        "peak_hours": _number(payload, "peak_hours", maximum=MAX_OPERATING_HOURS),
        "off_peak_hours": _number(payload, "off_peak_hours", maximum=MAX_OPERATING_HOURS),
        "electricity_rate_peak": _number(payload, "electricity_rate_peak"),
        "electricity_rate_off_peak": _number(payload, "electricity_rate_off_peak"),
        "water_rate_per_m3": _number(payload, "water_rate_per_m3"),
    }
    diff = abs(data["peak_hours"] + data["off_peak_hours"] - data["operating_hours"])
    if diff > TOLERANCE_HOURS:
        raise ValidationError("A soma de peak_hours e off_peak_hours deve ser igual a operating_hours "
                              f"(tolerância de {TOLERANCE_HOURS} h).")
    return data


def calcular_custo(payload):
    """Totais calculados a partir das parcelas já arredondadas, para a soma exibida bater com o total."""
    d = validate(payload)
    peak_kwh = d["pump_power_kw"] * d["peak_hours"]
    off_kwh = d["pump_power_kw"] * d["off_peak_hours"]
    total_kwh = d["pump_power_kw"] * d["operating_hours"]
    peak_cost = round(peak_kwh * d["electricity_rate_peak"], 2)
    off_cost = round(off_kwh * d["electricity_rate_off_peak"], 2)
    energy_cost = round(peak_cost + off_cost, 2)
    volume_m3 = d["water_liters"] / 1000.0
    water_cost = round(volume_m3 * d["water_rate_per_m3"], 2)
    return {
        "success": True,
        "provider": "Azure Functions",
        "service": "operational_cost",
        "energy": {"total_kwh": round(total_kwh, 2), "peak_kwh": round(peak_kwh, 2),
                   "off_peak_kwh": round(off_kwh, 2), "peak_cost": peak_cost,
                   "off_peak_cost": off_cost, "total_energy_cost": energy_cost},
        "water": {"volume_liters": round(d["water_liters"], 2), "volume_m3": round(volume_m3, 2),
                  "total_water_cost": water_cost},
        "total_operational_cost": round(energy_cost + water_cost, 2),
        "currency": "BRL",
        "disclaimer": DISCLAIMER,
    }
