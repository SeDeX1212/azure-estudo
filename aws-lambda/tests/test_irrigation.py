import json
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import lambda_function as lf  # noqa: E402

VALID = {"soil_moisture": 25, "temperature": 32, "crop_type": "milho", "area_m2": 1000}


def call(body, method="POST", raw=False):
    event = {"requestContext": {"http": {"method": method}}, "headers": {"Origin": "http://localhost:8080"},
             "body": body if raw else json.dumps(body)}
    res = lf.lambda_handler(event, None)
    return res["statusCode"], (json.loads(res["body"]) if res["body"] else None), res["headers"]


class IrrigationTests(unittest.TestCase):
    def test_valid_request_calculation(self):
        status, body, headers = call(VALID)
        self.assertEqual(status, 200)
        self.assertTrue(body["success"])
        self.assertEqual(body["provider"], "AWS Lambda")
        # déficit 35 pp * 0,25 = 8,75 ; fator 1 + 7*0,03 = 1,21 ; 10,5875 L/m²
        self.assertEqual(body["irrigation"]["water_liters_per_m2"], 10.59)
        self.assertAlmostEqual(body["irrigation"]["total_water_liters"], 10587.5)
        self.assertEqual(body["irrigation"]["need_level"], "Alta")
        self.assertEqual(headers["Content-Type"], "application/json")

    def test_no_need_when_soil_is_wet(self):
        _, body, _ = call({**VALID, "soil_moisture": 90})
        self.assertEqual(body["irrigation"]["water_liters_per_m2"], 0)
        self.assertEqual(body["irrigation"]["need_level"], "Nenhuma")

    def test_temperature_below_reference_has_no_factor(self):
        _, body, _ = call({**VALID, "temperature": 10})
        self.assertEqual(body["irrigation"]["temperature_factor"], 1.0)
        self.assertEqual(body["irrigation"]["water_liters_per_m2"], 8.75)

    def test_crop_accent_and_case_insensitive(self):
        status, body, _ = call({**VALID, "crop_type": " Café "})
        self.assertEqual(status, 200)
        self.assertEqual(body["input"]["crop_type"], "cafe")

    def test_missing_fields(self):
        for field in VALID:
            with self.subTest(field=field):
                payload = {k: v for k, v in VALID.items() if k != field}
                status, body, _ = call(payload)
                self.assertEqual(status, 400)
                self.assertEqual(body["error"]["code"], "VALIDATION_ERROR")
                self.assertIn(field, body["error"]["message"])

    def test_wrong_types(self):
        for field, value in [("soil_moisture", "25"), ("temperature", True), ("area_m2", [1]), ("crop_type", 10)]:
            with self.subTest(field=field):
                self.assertEqual(call({**VALID, field: value})[0], 400)

    def test_out_of_range(self):
        cases = [("soil_moisture", -1), ("soil_moisture", 101), ("temperature", 99), ("area_m2", 0),
                 ("area_m2", -5), ("crop_type", "banana")]
        for field, value in cases:
            with self.subTest(field=field, value=value):
                self.assertEqual(call({**VALID, field: value})[0], 400)

    def test_invalid_json_and_non_object(self):
        self.assertEqual(call("{nao e json", raw=True)[0], 400)
        self.assertEqual(call([1, 2, 3])[0], 400)

    def test_methods_and_preflight(self):
        self.assertEqual(call(VALID, method="GET")[0], 405)
        status, _, headers = call(None, method="OPTIONS", raw=True)
        self.assertEqual(status, 204)
        self.assertEqual(headers["Access-Control-Allow-Origin"], "*")

    def test_cors_restricted_origin(self):
        with mock.patch.dict(os.environ, {"ALLOWED_ORIGIN": "https://meu-app.vercel.app"}):
            self.assertNotIn("Access-Control-Allow-Origin", call(VALID)[2])
        with mock.patch.dict(os.environ, {"ALLOWED_ORIGIN": "http://localhost:8080,https://meu-app.vercel.app"}):
            self.assertEqual(call(VALID)[2]["Access-Control-Allow-Origin"], "http://localhost:8080")

    def test_internal_error_returns_500(self):
        with mock.patch.object(lf, "calculate", side_effect=ZeroDivisionError):
            status, body, _ = call(VALID)
        self.assertEqual(status, 500)
        self.assertEqual(body["error"]["code"], "INTERNAL_ERROR")


if __name__ == "__main__":
    unittest.main()
