"""Integration tests for the local JSON API. Run: python -m unittest backend.test_api"""

import http.client
import json
import tempfile
import threading
import unittest
from pathlib import Path

from backend import app


class ApiIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp_dir = tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parent.parent)
        app.DB_PATH = Path(cls.temp_dir.name) / "test.sqlite3"
        app.initialize_database()
        cls.server = app.ThreadingHTTPServer(("127.0.0.1", 0), app.CRMHandler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.port = cls.server.server_address[1]

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.temp_dir.cleanup()

    def request(self, method, path, payload=None, cookie=None, csrf=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.port)
        headers = {"Content-Type": "application/json", "Origin": f"http://127.0.0.1:{self.port}"}
        if cookie:
            headers["Cookie"] = cookie
        if csrf:
            headers["X-CSRF-Token"] = csrf
        body = json.dumps(payload).encode() if payload is not None else None
        connection.request(method, path, body=body, headers=headers)
        response = connection.getresponse()
        result = response.read()
        parsed = json.loads(result) if result else None
        response_headers = dict(response.getheaders())
        connection.close()
        return response.status, parsed, response_headers

    def register(self, email):
        status, payload, headers = self.request("POST", "/api/auth/register", {
            "fullName": "Test User", "workspaceName": "Test Workspace", "email": email,
            "password": "SafePassword123",
        })
        self.assertEqual(status, 201, payload)
        cookie = headers["Set-Cookie"].split(";", 1)[0]
        status, profile, _ = self.request("GET", "/api/auth/me", cookie=cookie)
        self.assertEqual(status, 200)
        return cookie, profile["csrfToken"]

    def test_auth_crud_pagination_and_validation(self):
        cookie, csrf = self.register("person@example.test")
        status, record, _ = self.request("POST", "/api/leads", {
            "company": "Northstar", "contactName": "Avery Chen", "email": "avery@example.test",
        }, cookie, csrf)
        self.assertEqual(status, 201, record)
        record_id = record["id"]
        status, rows, _ = self.request("GET", "/api/leads?page=1&limit=10&q=Northstar", cookie=cookie)
        self.assertEqual(status, 200)
        self.assertEqual(rows["total"], 1)
        status, updated, _ = self.request("PUT", f"/api/leads/{record_id}", {"status": "Qualifying"}, cookie, csrf)
        self.assertEqual(status, 200)
        self.assertEqual(updated["status"], "Qualifying")
        status, _, _ = self.request("POST", "/api/leads", {"company": "Missing name"}, cookie, csrf)
        self.assertEqual(status, 400)
        status, _, _ = self.request("DELETE", f"/api/leads/{record_id}", cookie=cookie, csrf=csrf)
        self.assertEqual(status, 204)

    def test_authentication_csrf_and_tenant_isolation(self):
        status, _, _ = self.request("GET", "/api/contacts")
        self.assertEqual(status, 401)
        first_cookie, first_csrf = self.register("first@example.test")
        second_cookie, second_csrf = self.register("second@example.test")
        status, record, _ = self.request("POST", "/api/contacts", {"name": "Private Contact"}, first_cookie, first_csrf)
        self.assertEqual(status, 201)
        status, _, _ = self.request("PUT", f"/api/contacts/{record['id']}", {"name": "Changed"}, first_cookie)
        self.assertEqual(status, 403)
        status, _, _ = self.request("GET", f"/api/contacts/{record['id']}", cookie=second_cookie)
        self.assertEqual(status, 404)
        status, _, _ = self.request("POST", "/api/auth/logout", {}, second_cookie, second_csrf)
        self.assertEqual(status, 200)
        status, _, _ = self.request("GET", "/api/auth/me", cookie=second_cookie)
        self.assertEqual(status, 401)

    def test_password_rules_and_origin_check(self):
        status, _, _ = self.request("POST", "/api/auth/register", {
            "fullName": "Bad Password", "email": "bad@example.test", "password": "weak",
        })
        self.assertEqual(status, 400)
        connection = http.client.HTTPConnection("127.0.0.1", self.port)
        connection.request("POST", "/api/auth/register", json.dumps({
            "fullName": "Origin User", "email": "origin@example.test", "password": "SafePassword123",
        }), {"Content-Type": "application/json", "Origin": "https://evil.example"})
        response = connection.getresponse()
        response.read()
        self.assertEqual(response.status, 403)
        connection.close()


if __name__ == "__main__":
    unittest.main()
