"""HTTP integration checks against a temporary catalog, never the store's data."""
import http.cookiejar
import io
import json
import os
import re
import socket
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]


class ManagementTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.folder = tempfile.TemporaryDirectory()
        cls.log = open(Path(cls.folder.name) / "server.log", "w+")
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            cls.port = sock.getsockname()[1]
        cls.base = f"http://127.0.0.1:{cls.port}"
        cls.env = dict(os.environ, DATA_DIR=cls.folder.name, SECRET_KEY="integration-test-session-secret-1234567890",
                       ADMIN_USERNAME="test-admin", ADMIN_PASSWORD="test-only-password", COOKIE_SECURE="false")
        cls.start()

    @classmethod
    def start(cls):
        cls.server = subprocess.Popen([sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", str(cls.port)],
            cwd=ROOT, env=cls.env, stdout=cls.log, stderr=cls.log,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
        for _ in range(100):
            try:
                with urllib.request.urlopen(cls.base + "/health", timeout=1) as response:
                    if response.status == 200:
                        return
            except (OSError, urllib.error.URLError):
                time.sleep(0.1)
        cls.server.terminate()
        cls.server.wait(timeout=10)
        cls.log.seek(0)
        raise RuntimeError(cls.log.read())

    @classmethod
    def tearDownClass(cls):
        cls.server.terminate()
        cls.server.wait(timeout=10)
        cls.log.close()
        cls.folder.cleanup()

    def setUp(self):
        self.client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

    def request(self, path, values=None, image=None):
        headers = {}
        body = None
        if image:
            boundary = "TabagynIntegrationBoundary"
            parts = []
            for key, value in values.items():
                for entry in (value if isinstance(value, list) else [value]):
                    parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{entry}\r\n'.encode())
            parts.extend([f'--{boundary}\r\nContent-Disposition: form-data; name="image"; filename="photo.png"\r\nContent-Type: image/png\r\n\r\n'.encode(), image, f'\r\n--{boundary}--\r\n'.encode()])
            body = b"".join(parts)
            headers["Content-Type"] = "multipart/form-data; boundary=" + boundary
        elif values is not None:
            body = urllib.parse.urlencode(values, doseq=True).encode()
        try:
            response = self.client.open(urllib.request.Request(self.base + path, data=body, headers=headers), timeout=15)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            return response.status, response.read(), response.headers, response.url

    def login(self, destination="/admin"):
        _, body, _, _ = self.request("/login")
        csrf = re.search(rb'name="csrf" value="([^"]+)"', body)[1].decode()
        status, body, headers, url = self.request("/login", dict(username="test-admin", password="test-only-password", csrf=csrf))
        self.assertEqual(status, 200)
        self.assertEqual(url, self.base + destination)
        self.assertEqual(headers["Cache-Control"], "no-store")
        return re.search(rb'name="csrf" value="([^"]+)"', body)[1].decode()

    def catalog(self):
        status, body, _, _ = self.request("/cardapio.js")
        self.assertEqual(status, 200)
        return json.loads(body.decode().removeprefix("window.CARDAPIO = ").removesuffix(";"))

    def test_01_public_and_authentication(self):
        status, body, headers, _ = self.request("/")
        self.assertEqual(status, 200)
        self.assertIn(b"TABAGYN", body)
        self.assertEqual(headers["X-Content-Type-Options"], "nosniff")
        _, body, _, url = self.request("/admin")
        self.assertTrue(url.endswith("/login"))
        csrf = re.search(rb'name="csrf" value="([^"]+)"', body)[1].decode()
        status, _, _, _ = self.request("/login", dict(username="test-admin", password="incorrect", csrf=csrf))
        self.assertEqual(status, 400)
        self.assertNotIn("password", json.dumps(self.catalog()))
        self.login()

    def test_02_protect_writes(self):
        before = self.catalog()
        self.request("/admin/settings", dict(csrf="fake", whatsapp="5511999999999"))
        self.assertEqual(self.catalog(), before)
        self.login()
        status, _, _, _ = self.request("/admin/settings", dict(csrf="fake", whatsapp="5511999999999"))
        self.assertEqual(status, 403)
        self.assertEqual(self.catalog(), before)

    def test_03_product_photo_and_edit(self):
        csrf = self.login()
        image = io.BytesIO()
        Image.new("RGB", (32, 32), "red").save(image, "PNG")
        values = dict(csrf=csrf, name="Produto integração", category="Doces", price="12,34", description="Foto e preço", available="true")
        status, _, _, _ = self.request("/admin/products", values, image.getvalue())
        self.assertEqual(status, 200)
        product = next(p for p in self.catalog()["produtos"] if p["nome"] == values["name"])
        self.assertEqual(product["preco"], 1234)
        photo_url = product["imagem"]
        status, photo, _, _ = self.request(photo_url)
        self.assertEqual(status, 200)
        self.assertEqual(Image.open(io.BytesIO(photo)).format, "JPEG")
        values.update(product_id=product["id"], price="15.90", remove_image="true")
        values.pop("available")
        self.assertEqual(self.request("/admin/products", values)[0], 200)
        edited = next(p for p in self.catalog()["produtos"] if p["id"] == product["id"])
        self.assertEqual(edited["preco"], 1590)
        self.assertFalse(edited["disponivel"])
        self.assertIsNone(edited["imagem"])
        self.assertEqual(self.request(photo_url)[0], 404)

    def test_04_reject_invalid_data(self):
        csrf = self.login()
        before = self.catalog()
        values = dict(csrf=csrf, name="Invalid", category="Doces", price="-1")
        for price in ["-1", "NaN", "Infinity", "1.001", "100000"]:
            values["price"] = price
            self.assertEqual(self.request("/admin/products", values)[0], 400)
        values["price"] = "10"
        self.assertEqual(self.request("/admin/products", values, b"not-an-image")[0], 400)
        self.assertEqual(self.catalog(), before)

    def test_06_settings_logout_and_persistence(self):
        csrf = self.login()
        self.assertEqual(self.request("/admin/settings", dict(csrf=csrf, whatsapp="55 62 99315-4345"))[0], 200)
        before = self.catalog()
        self.assertFalse(before["demonstracao"])
        self.assertEqual(before["whatsapp"], "5562993154345")
        self.request("/logout", dict(csrf=csrf))
        self.assertTrue(self.request("/admin")[3].endswith("/login"))
        type(self).server.terminate()
        type(self).server.wait(timeout=10)
        type(self).start()
        self.assertEqual(self.catalog(), before)

    def test_05_essences_and_allowed_sessions(self):
        self.assertTrue(self.request("/admin/essencias")[3].endswith("/login"))
        csrf = self.login("/admin/essencias")
        for name in ["Premium test", "Basic test"]:
            self.assertEqual(self.request("/admin/products", dict(csrf=csrf, name=name, category="Sessões", price="25", available="true"))[0], 200)
        sessions = [p for p in self.catalog()["produtos"] if p["sessao"]]
        self.assertEqual(len(sessions), 2)
        image = io.BytesIO()
        Image.new("RGB", (32, 32), "blue").save(image, "PNG")
        fields = dict(csrf=csrf, brand="Test brand", flavor="Test flavor", available="true", sessions=[p["id"] for p in sessions])
        self.assertEqual(self.request("/admin/essencias", fields, image.getvalue())[0], 200)
        essence = self.catalog()["essencias"][0]
        self.assertEqual(set(essence["sessoes"]), set(fields["sessions"]))
        self.assertEqual(essence["marca"], "Test brand")
        self.assertEqual(self.request(essence["imagem"])[0], 200)
        fields.update(essence_id=essence["id"], sessions=[sessions[0]["id"]])
        self.assertEqual(self.request("/admin/essencias", fields)[0], 200)
        self.assertEqual(self.catalog()["essencias"][0]["sessoes"], fields["sessions"])
        fields["sessions"] = ["agua"]
        self.assertEqual(self.request("/admin/essencias", fields)[0], 400)
        fields["sessions"] = [sessions[0]["id"]]
        fields["csrf"] = "invalid"
        self.assertEqual(self.request("/admin/essencias", fields)[0], 403)
        fields["csrf"] = csrf
        fields.pop("available")
        self.assertEqual(self.request("/admin/essencias", fields)[0], 200)
        self.assertEqual(self.catalog()["essencias"], [])
        fields["available"] = "true"
        fields["sessions"] = []
        self.assertEqual(self.request("/admin/essencias", fields)[0], 200)
        self.assertEqual(self.catalog()["essencias"][0]["sessoes"], [])


if __name__ == "__main__":
    unittest.main()
