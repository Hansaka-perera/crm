"""Dependency-free JSON API and static-file server for the ITGlow CRM prototype."""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = Path(os.environ.get("ITGLOW_DB_PATH", ROOT / "data" / "itglow.sqlite3"))
SESSION_COOKIE = "itglow_session"
SESSION_SECONDS = 60 * 60 * 12
MAX_BODY_BYTES = 256 * 1024
ALLOWED_ENTITIES = {"leads", "contacts", "organizations", "deals", "activities", "inbox"}
FIELD_LIMITS = {"email": 320, "name": 160, "title": 240, "company": 200, "notes": 4000}
LOGIN_ATTEMPTS: dict[str, list[float]] = {}


class ApiError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


@contextmanager
def connect():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA journal_mode = WAL")
    try:
        with connection:
            yield connection
    finally:
        connection.close()


def initialize_database() -> None:
    with connect() as db:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY,
            email TEXT NOT NULL UNIQUE COLLATE NOCASE,
            full_name TEXT NOT NULL,
            password_salt BLOB NOT NULL,
            password_hash BLOB NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS workspaces (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS memberships (
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            role TEXT NOT NULL CHECK(role IN ('owner','admin','member','viewer')),
            PRIMARY KEY(user_id, workspace_id)
        );
        CREATE TABLE IF NOT EXISTS sessions (
            token_hash BLOB PRIMARY KEY,
            csrf_token TEXT NOT NULL,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            expires_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS records (
            id INTEGER PRIMARY KEY,
            workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            entity TEXT NOT NULL,
            data TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS records_workspace_entity ON records(workspace_id, entity, id);
        CREATE TABLE IF NOT EXISTS settings (
            workspace_id INTEGER PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
            data TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        """)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def password_digest(password: str, salt: bytes) -> bytes:
    return hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1, dklen=32)


def validate_record(entity: str, value: object, partial: bool = False) -> dict:
    if entity not in ALLOWED_ENTITIES:
        raise ApiError(404, "Unknown record type.")
    if not isinstance(value, dict) or len(value) > 80:
        raise ApiError(400, "Record must be a JSON object with at most 80 fields.")
    data: dict = {}
    for key, item in value.items():
        if not isinstance(key, str) or not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{0,39}", key):
            raise ApiError(400, "Record contains an invalid field name.")
        if key in {"id", "workspace_id", "created_at", "updated_at"}:
            raise ApiError(400, f"Field '{key}' cannot be changed.")
        if isinstance(item, str):
            if len(item) > FIELD_LIMITS.get(key.lower(), 1000):
                raise ApiError(400, f"Field '{key}' is too long.")
        elif isinstance(item, (int, float)) and not isinstance(item, bool):
            if not (-1_000_000_000 <= item <= 1_000_000_000):
                raise ApiError(400, f"Field '{key}' is outside the supported range.")
        elif item is not None and not isinstance(item, (bool, list, dict)):
            raise ApiError(400, f"Field '{key}' has an unsupported value.")
        data[key] = item
    if not partial:
        requirements = {
            "leads": ("company", "contactName"), "contacts": ("name",),
            "organizations": ("name",), "deals": ("title", "value"),
            "activities": ("title", "date"), "inbox": ("subject",),
        }[entity]
        if any(data.get(field) in (None, "") for field in requirements):
            raise ApiError(400, "Required record fields are missing.")
    return data


class CRMHandler(SimpleHTTPRequestHandler):
    server_version = "ITGlowCRM/1.0"
    sys_version = ""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def translate_path(self, path: str) -> str:
        candidate = Path(super().translate_path(path)).resolve()
        try:
            candidate.relative_to(ROOT)
        except ValueError:
            return str(ROOT / "__not_found__")
        if candidate.suffix.lower() not in {".html", ".css", ".js", ".svg", ".png", ".ico"}:
            return str(ROOT / "__not_found__")
        if any(part.startswith(".") or part in {"backend", "scripts", "node_modules", "src", "data"} for part in candidate.relative_to(ROOT).parts):
            return str(ROOT / "__not_found__")
        if candidate.is_dir():
            return str(ROOT / "__not_found__")
        return str(candidate)

    def log_message(self, fmt, *args):
        if os.environ.get("ITGLOW_ACCESS_LOG", "0") == "1":
            super().log_message(fmt, *args)

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "same-origin")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        self.send_header("Content-Security-Policy", "default-src 'self' data:; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'")
        super().end_headers()

    def send_json(self, status: int, payload: object, headers: dict[str, str] | None = None):
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def send_error_json(self, error: ApiError):
        self.send_json(error.status, {"error": error.message})

    def read_json(self) -> dict:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            raise ApiError(400, "Invalid Content-Length.")
        if length < 1 or length > MAX_BODY_BYTES:
            raise ApiError(413 if length > MAX_BODY_BYTES else 400, "Request body is missing or too large.")
        if "application/json" not in self.headers.get("Content-Type", "").lower():
            raise ApiError(415, "Content-Type must be application/json.")
        try:
            value = json.loads(self.rfile.read(length))
        except (json.JSONDecodeError, UnicodeDecodeError):
            raise ApiError(400, "Request body must be valid JSON.")
        if not isinstance(value, dict):
            raise ApiError(400, "Request body must be a JSON object.")
        return value

    def check_origin(self):
        origin = self.headers.get("Origin")
        if not origin:
            return
        parsed = urlparse(origin)
        host = self.headers.get("Host", "")
        if parsed.netloc.lower() != host.lower() or parsed.scheme not in {"http", "https"}:
            raise ApiError(403, "Request origin is not allowed.")

    def get_session(self):
        cookie = SimpleCookie()
        try:
            cookie.load(self.headers.get("Cookie", ""))
        except Exception:
            return None
        morsel = cookie.get(SESSION_COOKIE)
        if not morsel:
            return None
        token_hash = hashlib.sha256(morsel.value.encode()).digest()
        with connect() as db:
            row = db.execute("SELECT s.csrf_token,s.user_id,s.expires_at,u.email,u.full_name,w.id AS workspace_id,w.name AS workspace_name,m.role FROM sessions s JOIN users u ON u.id=s.user_id JOIN memberships m ON m.user_id=u.id JOIN workspaces w ON w.id=m.workspace_id WHERE s.token_hash=?", (token_hash,)).fetchone()
            if not row or row["expires_at"] < int(time.time()):
                if row:
                    db.execute("DELETE FROM sessions WHERE token_hash=?", (token_hash,))
                return None
        return dict(row) | {"token_hash": token_hash}

    def require_session(self, mutation: bool = False):
        session = self.get_session()
        if not session:
            raise ApiError(401, "Sign in to continue.")
        if mutation:
            self.check_origin()
            supplied = self.headers.get("X-CSRF-Token", "")
            if not hmac.compare_digest(supplied, session["csrf_token"]):
                raise ApiError(403, "CSRF token is missing or invalid.")
            if session["role"] == "viewer":
                raise ApiError(403, "This workspace role is read-only.")
        return session

    def request_path(self):
        return unquote(urlparse(self.path).path)

    def do_GET(self):
        path = self.request_path()
        if path.startswith("/api/"):
            try:
                self.route_api("GET", path)
            except ApiError as error:
                self.send_error_json(error)
            except sqlite3.Error:
                self.send_error_json(ApiError(500, "Database operation failed."))
            return
        return super().do_GET()

    def do_POST(self): self.handle_mutation("POST")
    def do_PUT(self): self.handle_mutation("PUT")
    def do_DELETE(self): self.handle_mutation("DELETE")

    def handle_mutation(self, method: str):
        try:
            self.route_api(method, self.request_path())
        except ApiError as error:
            self.send_error_json(error)
        except sqlite3.IntegrityError:
            self.send_error_json(ApiError(409, "A record with that unique value already exists."))
        except sqlite3.Error:
            self.send_error_json(ApiError(500, "Database operation failed."))

    def route_api(self, method: str, path: str):
        if path == "/api/health" and method == "GET":
            self.send_json(200, {"ok": True, "service": "itglow-crm"}); return
        if path.startswith("/api/auth/"):
            self.route_auth(method, path); return
        session = self.require_session(mutation=method != "GET")
        parts = [part for part in path.split("/") if part]
        if len(parts) == 2 and parts[1] == "insights" and method == "GET":
            self.route_insights(session); return
        if len(parts) == 2 and parts[1] == "workspace":
            self.route_workspace(method, session); return
        if len(parts) == 2 and parts[1] == "settings":
            self.route_settings(method, session); return
        if len(parts) not in (2, 3) or parts[0] != "api" or parts[1] not in ALLOWED_ENTITIES:
            raise ApiError(404, "API route not found.")
        entity = parts[1]
        if len(parts) == 2:
            self.route_record_collection(method, entity, session); return
        try:
            record_id = int(parts[2])
        except ValueError:
            raise ApiError(400, "Record id must be a number.")
        self.route_record_item(method, entity, record_id, session)

    def route_auth(self, method: str, path: str):
        if method == "GET" and path == "/api/auth/me":
            session = self.get_session()
            if not session:
                raise ApiError(401, "Sign in to continue.")
            self.send_json(200, {"user": {"id": session["user_id"], "email": session["email"], "fullName": session["full_name"]}, "workspace": {"id": session["workspace_id"], "name": session["workspace_name"], "role": session["role"]}, "csrfToken": session["csrf_token"]}); return
        if method == "POST" and path in {"/api/auth/register", "/api/auth/login"}:
            self.check_origin()
            payload = self.read_json()
            email = str(payload.get("email", "")).strip().lower()
            password = payload.get("password", "")
            if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email) or len(email) > 320:
                raise ApiError(400, "Enter a valid email address.")
            if not isinstance(password, str):
                raise ApiError(400, "Password is required.")
            if path.endswith("register"):
                full_name = str(payload.get("fullName", "")).strip()
                workspace_name = str(payload.get("workspaceName", "")).strip() or f"{full_name or 'My'} workspace"
                if not full_name or len(full_name) > 160 or len(workspace_name) > 160:
                    raise ApiError(400, "Name and workspace name are required and must be under 160 characters.")
                if len(password) < 12 or not re.search(r"[A-Z]", password) or not re.search(r"[a-z]", password) or not re.search(r"\d", password):
                    raise ApiError(400, "Use at least 12 characters with uppercase, lowercase, and a number.")
                salt = secrets.token_bytes(16)
                digest = password_digest(password, salt)
                with connect() as db:
                    cur = db.execute("INSERT INTO users(email,full_name,password_salt,password_hash,created_at) VALUES(?,?,?,?,?)", (email, full_name, salt, digest, now_iso()))
                    user_id = cur.lastrowid
                    workspace_id = db.execute("INSERT INTO workspaces(name,owner_id,created_at) VALUES(?,?,?)", (workspace_name, user_id, now_iso())).lastrowid
                    db.execute("INSERT INTO memberships(user_id,workspace_id,role) VALUES(?,?, 'owner')", (user_id, workspace_id))
            else:
                attempts = [when for when in LOGIN_ATTEMPTS.get(self.client_address[0], []) if when > time.time() - 600]
                if len(attempts) >= 10:
                    raise ApiError(429, "Too many sign-in attempts. Try again in ten minutes.")
                with connect() as db:
                    row = db.execute("SELECT id,email,full_name,password_salt,password_hash FROM users WHERE email=?", (email,)).fetchone()
                valid = bool(row and hmac.compare_digest(password_digest(password, row["password_salt"]), row["password_hash"]))
                if not valid:
                    attempts.append(time.time()); LOGIN_ATTEMPTS[self.client_address[0]] = attempts
                    raise ApiError(401, "Email or password is incorrect.")
                LOGIN_ATTEMPTS.pop(self.client_address[0], None)
                user_id = row["id"]
                with connect() as db:
                    workspace_id = db.execute("SELECT workspace_id FROM memberships WHERE user_id=? ORDER BY workspace_id LIMIT 1", (user_id,)).fetchone()[0]
            self.create_session(user_id)
            self.send_json(201 if path.endswith("register") else 200, {"ok": True}, {"Set-Cookie": self.session_cookie()}); return
        if method == "POST" and path == "/api/auth/logout":
            session = self.require_session(mutation=True)
            with connect() as db:
                db.execute("DELETE FROM sessions WHERE token_hash=?", (session["token_hash"],))
            self.send_json(200, {"ok": True}, {"Set-Cookie": self.session_cookie(clear=True)}); return
        raise ApiError(404, "Authentication route not found.")

    def create_session(self, user_id: int):
        token = secrets.token_urlsafe(32)
        csrf = secrets.token_urlsafe(24)
        token_hash = hashlib.sha256(token.encode()).digest()
        with connect() as db:
            db.execute("DELETE FROM sessions WHERE expires_at < ?", (int(time.time()),))
            db.execute("INSERT INTO sessions(token_hash,csrf_token,user_id,expires_at) VALUES(?,?,?,?)", (token_hash, csrf, user_id, int(time.time()) + SESSION_SECONDS))
        self._new_session_token = token

    def session_cookie(self, clear: bool = False):
        secure = "; Secure" if os.environ.get("ITGLOW_COOKIE_SECURE") == "1" else ""
        if clear:
            return f"{SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0{secure}"
        return f"{SESSION_COOKIE}={self._new_session_token}; Path=/; HttpOnly; SameSite=Strict; Max-Age={SESSION_SECONDS}{secure}"

    def route_record_collection(self, method: str, entity: str, session: dict):
        query = parse_qs(urlparse(self.path).query)
        with connect() as db:
            if method == "GET":
                try:
                    page = max(1, min(100000, int(query.get("page", ["1"])[0])))
                    limit = max(1, min(100, int(query.get("limit", ["50"])[0])))
                except ValueError:
                    raise ApiError(400, "Page and limit must be integers.")
                term = query.get("q", [""])[0].strip()[:100]
                where = "workspace_id=? AND entity=?"
                params: list = [session["workspace_id"], entity]
                if term:
                    where += " AND data LIKE ? COLLATE NOCASE"; params.append(f"%{term}%")
                total = db.execute(f"SELECT COUNT(*) FROM records WHERE {where}", params).fetchone()[0]
                rows = db.execute(f"SELECT id,data,created_at,updated_at FROM records WHERE {where} ORDER BY id DESC LIMIT ? OFFSET ?", (*params, limit, (page-1)*limit)).fetchall()
                items = [{"id": row["id"], **json.loads(row["data"]), "createdAt": row["created_at"], "updatedAt": row["updated_at"]} for row in rows]
                self.send_json(200, {"items": items, "page": page, "limit": limit, "total": total}); return
            if method == "POST":
                data = validate_record(entity, self.read_json())
                stamp = now_iso()
                cur = db.execute("INSERT INTO records(workspace_id,entity,data,created_at,updated_at) VALUES(?,?,?,?,?)", (session["workspace_id"], entity, json.dumps(data, ensure_ascii=False, separators=(",", ":")), stamp, stamp))
                self.send_json(201, {"id": cur.lastrowid, **data, "createdAt": stamp, "updatedAt": stamp}); return
        raise ApiError(405, "Method not allowed.")

    def route_record_item(self, method: str, entity: str, record_id: int, session: dict):
        with connect() as db:
            row = db.execute("SELECT id,data,created_at,updated_at FROM records WHERE id=? AND workspace_id=? AND entity=?", (record_id, session["workspace_id"], entity)).fetchone()
            if not row: raise ApiError(404, "Record not found.")
            if method == "GET":
                self.send_json(200, {"id": row["id"], **json.loads(row["data"]), "createdAt": row["created_at"], "updatedAt": row["updated_at"]}); return
            if method == "PUT":
                patch = validate_record(entity, self.read_json(), partial=True)
                data = json.loads(row["data"]) | patch
                data = validate_record(entity, data)
                stamp = now_iso()
                db.execute("UPDATE records SET data=?,updated_at=? WHERE id=? AND workspace_id=?", (json.dumps(data, ensure_ascii=False, separators=(",", ":")), stamp, record_id, session["workspace_id"]))
                self.send_json(200, {"id": record_id, **data, "createdAt": row["created_at"], "updatedAt": stamp}); return
            if method == "DELETE":
                db.execute("DELETE FROM records WHERE id=? AND workspace_id=?", (record_id, session["workspace_id"]))
                self.send_response(204); self.send_header("Cache-Control", "no-store"); self.end_headers(); return
        raise ApiError(405, "Method not allowed.")

    def route_settings(self, method: str, session: dict):
        with connect() as db:
            if method == "GET":
                row = db.execute("SELECT data,updated_at FROM settings WHERE workspace_id=?", (session["workspace_id"],)).fetchone()
                self.send_json(200, {"settings": json.loads(row["data"]) if row else {}, "updatedAt": row["updated_at"] if row else None}); return
            if method == "PUT":
                value = self.read_json()
                if len(value) > 80 or any(not isinstance(key, str) or not isinstance(item, (str, bool, int, float, list, dict, type(None))) for key, item in value.items()):
                    raise ApiError(400, "Invalid settings payload.")
                stamp = now_iso()
                db.execute("INSERT INTO settings(workspace_id,data,updated_at) VALUES(?,?,?) ON CONFLICT(workspace_id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at", (session["workspace_id"], json.dumps(value, ensure_ascii=False), stamp))
                self.send_json(200, {"settings": value, "updatedAt": stamp}); return
        raise ApiError(405, "Method not allowed.")

    def route_workspace(self, method: str, session: dict):
        with connect() as db:
            if method == "GET":
                row = db.execute("SELECT id,name FROM workspaces WHERE id=?", (session["workspace_id"],)).fetchone()
                self.send_json(200, dict(row)); return
            if method == "PUT":
                if session["role"] not in {"owner", "admin"}:
                    raise ApiError(403, "Only workspace admins may update workspace details.")
                payload = self.read_json()
                name = payload.get("name")
                if not isinstance(name, str) or not name.strip() or len(name.strip()) > 160:
                    raise ApiError(400, "Workspace name is required and must be under 160 characters.")
                db.execute("UPDATE workspaces SET name=? WHERE id=?", (name.strip(), session["workspace_id"]))
                self.send_json(200, {"id": session["workspace_id"], "name": name.strip()}); return
        raise ApiError(405, "Method not allowed.")

    def route_insights(self, session: dict):
        with connect() as db:
            rows = db.execute("SELECT data FROM records WHERE workspace_id=? AND entity='deals'", (session["workspace_id"],)).fetchall()
            activities = db.execute("SELECT COUNT(*) FROM records WHERE workspace_id=? AND entity='activities'", (session["workspace_id"],)).fetchone()[0]
        deals = [json.loads(row["data"]) for row in rows]
        open_deals = [deal for deal in deals if not deal.get("won") and str(deal.get("stage", "")).lower() != "won"]
        won_deals = [deal for deal in deals if deal.get("won") or str(deal.get("stage", "")).lower() == "won"]
        self.send_json(200, {"dealCount": len(deals), "openCount": len(open_deals), "openValue": sum(float(deal.get("value", 0) or 0) for deal in open_deals), "weightedValue": sum(float(deal.get("value", 0) or 0) * float(deal.get("prob", 0) or 0) / 100 for deal in open_deals), "wonValue": sum(float(deal.get("value", 0) or 0) for deal in won_deals), "activityCount": activities})


def main():
    initialize_database()
    host = os.environ.get("ITGLOW_HOST", "127.0.0.1")
    port = int(os.environ.get("ITGLOW_PORT", "8000"))
    server = ThreadingHTTPServer((host, port), CRMHandler)
    print(f"ITGlow CRM serving on http://{host}:{port} (SQLite: {DB_PATH})")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
