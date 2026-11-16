"""AgroSense ESG - lógica pura de pegada de carbono e índice ESG demonstrativo (sem dependências).

Modelo ACADÊMICO e demonstrativo: não é medição científica, não é crédito de carbono
certificado e o índice não representa certificação ESG oficial.

Fórmulas:
    emissões_kgCO2e     = energy_kwh * carbon_factor_kg_per_kwh
    hectares            = planted_area_m2 / 10_000
    árvores_equivalentes= emissões_kgCO2e / absorção_kg_por_árvore_ano   (arredonda-se para cima)
    intensidade_carbono = emissões_kgCO2e / hectares          (kg CO2e/ha por operação)
    intensidade_energia = energy_kwh / hectares               (kWh/ha por operação)
    nota_carbono        = 100 * max(0, 1 - intensidade_carbono / REF_CARBON_INTENSITY_KG_PER_HA)
    nota_energia        = 100 * max(0, 1 - intensidade_energia / REF_ENERGY_INTENSITY_KWH_PER_HA)
    índice_ESG          = 0,7 * nota_carbono + 0,3 * nota_energia        (0 a 100)
"""
import math

# ============ PARÂMETROS DEMONSTRATIVOS (ajustáveis) ============
DEFAULT_ABSORPTION_KG_PER_TREE_YEAR = 20.0   # varia com espécie, clima, idade e período
REF_CARBON_INTENSITY_KG_PER_HA = 50.0        # intensidade que zera a nota de carbono
REF_ENERGY_INTENSITY_KWH_PER_HA = 200.0      # intensidade que zera a nota de energia
WEIGHT_CARBON = 0.7
WEIGHT_ENERGY = 0.3
CLASSIFICATIONS = [(80, "Excelente"), (60, "Boa"), (40, "Moderada"), (0, "Crítica")]
# =================================================================

LIMITATIONS = ("O fator de emissão da eletricidade depende da matriz energética e do período adotados. "
               "A absorção de carbono por árvores varia com espécie, clima, idade e tempo considerado. "
               "Árvores equivalentes não são créditos de carbono certificados.")
DISCLAIMER = "Indicadores estimados para fins educacionais, sem certificação ambiental."


class ValidationError(ValueError):
    pass


def _number(payload, field, minimum, maximum, required=True, default=None, positive=False):
    if field not in payload or payload[field] is None:
        if required:
            raise ValidationError(f"Campo obrigatório ausente: {field}.")
        return default
    value = payload[field]
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValidationError(f"O campo {field} deve ser numérico.")
    if value != value or value in (float("inf"), float("-inf")):
        raise ValidationError(f"O campo {field} deve ser um número finito.")
    if value < minimum or (positive and value <= minimum) or value > maximum:
        raise ValidationError(f"O campo {field} deve estar entre {minimum}"
                              f"{' (exclusivo)' if positive else ''} e {maximum}.")
    return float(value)


def validate(payload):
    if not isinstance(payload, dict):
        raise ValidationError("O corpo da requisição deve ser um objeto JSON.")
    return {
        "energy_kwh": _number(payload, "energy_kwh", 0, 1_000_000),
        "planted_area_m2": _number(payload, "planted_area_m2", 0, 10_000_000, positive=True),
        "carbon_factor_kg_per_kwh": _number(payload, "carbon_factor_kg_per_kwh", 0, 2),
        "absorption_kg_per_tree_year": _number(payload, "absorption_kg_per_tree_year", 0, 1000, required=False,
                                               default=DEFAULT_ABSORPTION_KG_PER_TREE_YEAR, positive=True),
    }


def classify(index):
    for floor, label in CLASSIFICATIONS:
        if index >= floor:
            return label
    return CLASSIFICATIONS[-1][1]


def calcular_carbono_esg(payload):
    d = validate(payload)
    emissions = d["energy_kwh"] * d["carbon_factor_kg_per_kwh"]
    hectares = d["planted_area_m2"] / 10_000.0
    trees_exact = emissions / d["absorption_kg_per_tree_year"]
    carbon_intensity = emissions / hectares
    energy_intensity = d["energy_kwh"] / hectares
    carbon_score = 100 * max(0.0, 1 - carbon_intensity / REF_CARBON_INTENSITY_KG_PER_HA)
    energy_score = 100 * max(0.0, 1 - energy_intensity / REF_ENERGY_INTENSITY_KWH_PER_HA)
    index = round(WEIGHT_CARBON * carbon_score + WEIGHT_ENERGY * energy_score, 1)
    return {
        "success": True,
        "provider": "Google Cloud Run Functions",
        "service": "carbon_esg",
        "carbon": {"energy_kwh": d["energy_kwh"], "emission_factor": d["carbon_factor_kg_per_kwh"],
                   "estimated_emissions_kg_co2e": round(emissions, 2),
                   "carbon_intensity_kg_per_ha": round(carbon_intensity, 2),
                   "energy_intensity_kwh_per_ha": round(energy_intensity, 2)},
        "land": {"planted_area_m2": d["planted_area_m2"], "planted_area_hectares": round(hectares, 4)},
        "compensation": {"estimated_trees_equivalent": math.ceil(trees_exact - 1e-9) if emissions > 0 else 0,
                         "trees_exact": round(trees_exact, 3),
                         "absorption_factor_kg_per_tree_year": d["absorption_kg_per_tree_year"]},
        "esg": {"index": index, "classification": classify(index),
                "sub_scores": {"carbon": round(carbon_score, 1), "energy": round(energy_score, 1)},
                "weights": {"carbon": WEIGHT_CARBON, "energy": WEIGHT_ENERGY},
                "methodology": ("Índice = 70% nota de carbono + 30% nota de energia; cada nota cai linearmente de 100 a 0 "
                                f"até {REF_CARBON_INTENSITY_KG_PER_HA:g} kg CO2e/ha e {REF_ENERGY_INTENSITY_KWH_PER_HA:g} kWh/ha. "
                                "Faixas: >=80 Excelente, >=60 Boa, >=40 Moderada, <40 Crítica."),
                "limitations": LIMITATIONS},
        "disclaimer": DISCLAIMER,
    }
