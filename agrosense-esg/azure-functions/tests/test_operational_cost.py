import json
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from custo import ValidationError, calcular_custo  # noqa: E402

VALID = {"water_liters": 8500, "pump_power_kw": 2.2, "operating_hours": 3, "peak_hours": 1,
         "off_peak_hours": 2, "electricity_rate_peak": 1.20, "electricity_rate_off_peak": 0.65,
         "water_rate_per_m3": 5.00}


class CostTests(unittest.TestCase):
    def test_valid_calculation(self):
        r = calcular_custo(VALID)
        self.assertTrue(r["success"])
        self.assertEqual((r["provider"], r["currency"]), ("Azure Functions", "BRL"))
        self.assertEqual(r["energy"], {"total_kwh": 6.6, "peak_kwh": 2.2, "off_peak_kwh": 4.4, "peak_cost": 2.64,
                                       "off_peak_cost": 2.86, "total_energy_cost": 5.5})
        self.assertEqual(r["water"], {"volume_liters": 8500, "volume_m3": 8.5, "total_water_cost": 42.5})
        self.assertEqual(r["total_operational_cost"], 48.0)
        json.dumps(r)

    def test_peak_split_adds_up(self):
        r = calcular_custo({**VALID, "peak_hours": 0.5, "off_peak_hours": 2.5})
        self.assertAlmostEqual(r["energy"]["peak_kwh"] + r["energy"]["off_peak_kwh"], r["energy"]["total_kwh"])

    def test_zero_water_allowed_and_tolerance(self):
        self.assertEqual(calcular_custo({**VALID, "water_liters": 0})["water"]["total_water_cost"], 0)
        self.assertTrue(calcular_custo({**VALID, "off_peak_hours": 2.005})["success"])

    def test_missing_field(self):
        for field in VALID:
            with self.subTest(field=field), self.assertRaisesRegex(ValidationError, field):
                calcular_custo({k: v for k, v in VALID.items() if k != field})

    def test_wrong_type_and_negative(self):
        for field in VALID:
            with self.subTest(field=field):
                with self.assertRaises(ValidationError):
                    calcular_custo({**VALID, field: "1"})
                with self.assertRaises(ValidationError):
                    calcular_custo({**VALID, field: -1})

    def test_zero_not_allowed(self):
        for field in ("pump_power_kw", "operating_hours"):
            with self.subTest(field=field), self.assertRaises(ValidationError):
                calcular_custo({**VALID, field: 0})

    def test_inconsistent_hours_and_limits(self):
        with self.assertRaisesRegex(ValidationError, "soma"):
            calcular_custo({**VALID, "peak_hours": 2, "off_peak_hours": 2})
        with self.assertRaises(ValidationError):
            calcular_custo({**VALID, "operating_hours": 30, "peak_hours": 10, "off_peak_hours": 20})
        with self.assertRaises(ValidationError):
            calcular_custo([])


try:
    import azure.functions as func
except ImportError:  # pacote não instalado: testes do gatilho HTTP são ignorados
    func = None


@unittest.skipIf(func is None, "azure-functions não instalado")
class HttpTriggerTests(unittest.TestCase):
    def _req(self, method="POST", body=None, raw=None):
        data = raw if raw is not None else (json.dumps(body).encode() if body is not None else b"")
        return func.HttpRequest(method=method, url="/api/custo", body=data,
                                headers={"Content-Type": "application/json"})

    def test_status_codes(self):
        import function_app
        h = function_app.custo.build().get_user_function()
        self.assertEqual(h(self._req(body=VALID)).status_code, 200)
        self.assertEqual(h(self._req(body={**VALID, "water_liters": -1})).status_code, 400)
        self.assertEqual(h(self._req(raw=b"{ruim")).status_code, 400)
        self.assertEqual(h(self._req(method="GET")).status_code, 405)
        self.assertEqual(h(self._req(method="OPTIONS")).status_code, 204)


if __name__ == "__main__":
    unittest.main()
