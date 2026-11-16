import json
import os
import sys
import types
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
try:
    import functions_framework  # noqa: F401
except ImportError:  # ambiente sem o pacote: stub mínimo só para testar o handler
    sys.modules["functions_framework"] = types.SimpleNamespace(http=lambda f: f)

import main  # noqa: E402
from esg import ValidationError, calcular_carbono_esg  # noqa: E402

VALID = {"energy_kwh": 6.6, "planted_area_m2": 1000, "carbon_factor_kg_per_kwh": 0.08}


class FakeRequest:
    def __init__(self, method="POST", body=None, headers=None):
        self.method, self._body, self.headers = method, body, headers or {"Origin": "http://localhost:8080"}

    def get_json(self, silent=False):
        return self._body


def call(body, method="POST"):
    text, status, headers = main.carbon_esg(FakeRequest(method, body))
    return status, (json.loads(text) if text else None), headers


class CarbonTests(unittest.TestCase):
    def test_valid_calculation(self):
        r = calcular_carbono_esg(VALID)
        self.assertEqual(r["provider"], "Google Cloud Run Functions")
        self.assertEqual(r["carbon"]["estimated_emissions_kg_co2e"], 0.53)       # 6,6 * 0,08 = 0,528
        self.assertEqual(r["land"]["planted_area_hectares"], 0.1)
        self.assertEqual(r["compensation"]["estimated_trees_equivalent"], 1)      # ceil(0,528 / 20)
        # carbono: 5,28 kg/ha -> 89,44 ; energia: 66 kWh/ha -> 67 ; 0,7*89,44 + 0,3*67 = 82,7
        self.assertEqual(r["esg"]["index"], 82.7)
        self.assertEqual(r["esg"]["classification"], "Excelente")
        self.assertIn("limitations", r["esg"])

    def test_zero_energy_and_custom_absorption(self):
        r = calcular_carbono_esg({**VALID, "energy_kwh": 0})
        self.assertEqual((r["esg"]["index"], r["compensation"]["estimated_trees_equivalent"]), (100.0, 0))
        r = calcular_carbono_esg({**VALID, "energy_kwh": 500, "absorption_kg_per_tree_year": 10})
        self.assertEqual(r["compensation"]["estimated_trees_equivalent"], 4)

    def test_index_is_bounded_and_classified(self):
        r = calcular_carbono_esg({"energy_kwh": 100000, "planted_area_m2": 10, "carbon_factor_kg_per_kwh": 2})
        self.assertEqual((r["esg"]["index"], r["esg"]["classification"]), (0.0, "Crítica"))

    def test_validation_errors(self):
        bad = [{k: v for k, v in VALID.items() if k != f} for f in VALID]
        bad += [{**VALID, "energy_kwh": -1}, {**VALID, "planted_area_m2": 0},   # divisão por zero evitada
                {**VALID, "carbon_factor_kg_per_kwh": 5}, {**VALID, "energy_kwh": "6"},
                {**VALID, "absorption_kg_per_tree_year": 0}, [], {**VALID, "planted_area_m2": True}]
        for payload in bad:
            with self.subTest(payload=payload), self.assertRaises(ValidationError):
                calcular_carbono_esg(payload)

    def test_http_success_and_cors(self):
        status, body, headers = call(VALID)
        self.assertEqual(status, 200)
        self.assertTrue(body["success"])
        self.assertEqual(headers["Content-Type"], "application/json")
        self.assertEqual(headers["Access-Control-Allow-Origin"], "*")

    def test_http_errors(self):
        self.assertEqual(call({**VALID, "energy_kwh": -3})[0], 400)
        self.assertEqual(call(None)[0], 400)
        self.assertEqual(call(VALID, method="GET")[0], 405)
        self.assertEqual(call(None, method="OPTIONS")[0], 204)

    def test_restricted_origin(self):
        with mock.patch.dict(os.environ, {"ALLOWED_ORIGIN": "https://app.exemplo.com"}):
            self.assertNotIn("Access-Control-Allow-Origin", call(VALID)[2])

    def test_internal_error_500(self):
        with mock.patch.object(main, "calcular_carbono_esg", side_effect=RuntimeError("x")):
            status, body, _ = call(VALID)
        self.assertEqual((status, body["error"]["code"]), (500, "INTERNAL_ERROR"))


if __name__ == "__main__":
    unittest.main()
