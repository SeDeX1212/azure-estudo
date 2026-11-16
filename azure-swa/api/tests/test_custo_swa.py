import json
import os
import sys
import types
import unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

try:  # com o pacote real instalado usamos o real; senão, um stub mínimo só para testar o handler
    import azure.functions as func  # noqa: F401
    REAL = True
except ImportError:
    REAL = False
    class HttpRequest:
        def __init__(self, method, body=b"", headers=None):
            self.method, self._body, self.headers = method, body, headers or {}
        def get_json(self):
            return json.loads(self._body.decode())
    class HttpResponse:
        def __init__(self, body="", status_code=200, mimetype=None, headers=None):
            self._body, self.status_code, self.mimetype, self.headers = body, status_code, mimetype, headers or {}
        def get_body(self):
            return self._body.encode() if isinstance(self._body, str) else self._body
    azure = types.ModuleType("azure"); fn = types.ModuleType("azure.functions")
    fn.HttpRequest, fn.HttpResponse = HttpRequest, HttpResponse
    azure.functions = fn
    sys.modules["azure"], sys.modules["azure.functions"] = azure, fn
    func = fn

import custo  # noqa: E402
from custo.calculo import calcular_custo  # noqa: E402

VALID = {"water_liters": 8500, "pump_power_kw": 2.2, "operating_hours": 3, "peak_hours": 1,
         "off_peak_hours": 2, "electricity_rate_peak": 1.20, "electricity_rate_off_peak": 0.65, "water_rate_per_m3": 5.00}


def call(body=None, method="POST", raw=None, origin="http://127.0.0.1:5500"):
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else b"")
    res = custo.main(func.HttpRequest(method=method, url="/api/custo", body=data, headers={"Origin": origin}) if REAL
                     else func.HttpRequest(method, data, {"Origin": origin}))
    body = res.get_body()
    return res.status_code, (json.loads(body) if body else None), dict(res.headers)


class SwaCostTests(unittest.TestCase):
    def test_valid(self):
        status, body, headers = call(VALID)
        self.assertEqual(status, 200)
        self.assertEqual(body["total_operational_cost"], 48.0)
        self.assertEqual(body["energy"]["total_kwh"], 6.6)
        self.assertEqual(headers["Access-Control-Allow-Origin"], "*")

    def test_errors(self):
        self.assertEqual(call({**VALID, "water_liters": -1})[0], 400)
        self.assertEqual(call({k: v for k, v in VALID.items() if k != "pump_power_kw"})[0], 400)
        self.assertEqual(call({**VALID, "peak_hours": 2, "off_peak_hours": 2})[0], 400)
        self.assertEqual(call(raw=b"{ruim")[0], 400)
        self.assertEqual(call(method="GET")[0], 405)

    def test_preflight_and_restricted_origin(self):
        self.assertEqual(call(method="OPTIONS")[0], 204)
        with mock.patch.dict(os.environ, {"ALLOWED_ORIGIN": "https://site.azurestaticapps.net"}):
            self.assertNotIn("Access-Control-Allow-Origin", call(VALID)[2])
        with mock.patch.dict(os.environ, {"ALLOWED_ORIGIN": "https://site.azurestaticapps.net,http://127.0.0.1:5500"}):
            self.assertEqual(call(VALID)[2]["Access-Control-Allow-Origin"], "http://127.0.0.1:5500")

    def test_internal_error(self):
        with mock.patch.object(custo, "calcular_custo", side_effect=RuntimeError("x")):
            status, body, _ = call(VALID)
        self.assertEqual((status, body["error"]["code"]), (500, "INTERNAL_ERROR"))


if __name__ == "__main__":
    unittest.main()
