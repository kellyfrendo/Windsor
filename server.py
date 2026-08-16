#!/usr/bin/env python3
"""Windsor local server with a SQLite database so lessons, topics, and files persist."""

from __future__ import annotations

import json
import mimetypes
import os
import socket
import sqlite3
import sys
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "windsor.db"
HOST = os.environ.get("WINDSOR_HOST", "0.0.0.0")
PORT = int(os.environ.get("WINDSOR_PORT", "8081"))
MAX_BODY = 30 * 1024 * 1024
DB_LOCK = threading.Lock()

HIDDEN_NAMES = {".git", ".gitignore", "server.py", "windsor.db", "windsor.db-journal", "windsor.db-wal", "windsor.db-shm"}


def connect():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    return conn


def init_db():
    with DB_LOCK:
        conn = connect()
        try:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS meta (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS files (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    type TEXT NOT NULL,
                    data BLOB NOT NULL
                )
                """
            )
            conn.commit()
        finally:
            conn.close()


def db_get_state():
    with DB_LOCK:
        conn = connect()
        try:
            row = conn.execute("SELECT value FROM meta WHERE key = 'state'").fetchone()
            return row[0] if row else None
        finally:
            conn.close()


def db_put_state(value: str):
    with DB_LOCK:
        conn = connect()
        try:
            conn.execute(
                "INSERT INTO meta(key, value) VALUES('state', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (value,),
            )
            conn.commit()
        finally:
            conn.close()


def db_list_files():
    with DB_LOCK:
        conn = connect()
        try:
            rows = conn.execute("SELECT id FROM files ORDER BY id").fetchall()
            return [row[0] for row in rows]
        finally:
            conn.close()


def db_get_file(file_id: str):
    with DB_LOCK:
        conn = connect()
        try:
            row = conn.execute("SELECT name, type, data FROM files WHERE id = ?", (file_id,)).fetchone()
            return row
        finally:
            conn.close()


def db_put_file(file_id: str, name: str, type_: str, data: bytes):
    with DB_LOCK:
        conn = connect()
        try:
            conn.execute(
                """
                INSERT INTO files(id, name, type, data)
                VALUES(?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,
                    type = excluded.type,
                    data = excluded.data
                """,
                (file_id, name, type_, data),
            )
            conn.commit()
        finally:
            conn.close()


def db_delete_file(file_id: str):
    with DB_LOCK:
        conn = connect()
        try:
            conn.execute("DELETE FROM files WHERE id = ?", (file_id,))
            conn.commit()
        finally:
            conn.close()


def lan_ip():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("8.8.8.8", 80))
            return sock.getsockname()[0]
    except OSError:
        return None


class WindsorHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, format, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), format % args))

    def end_headers(self):
        if self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        if self.path.startswith("/api/"):
            self.handle_api("GET")
            return
        super().do_GET()

    def do_PUT(self):
        self.handle_api("PUT")

    def do_POST(self):
        self.handle_api("POST")

    def do_DELETE(self):
        self.handle_api("DELETE")

    def translate_path(self, path):
        translated = super().translate_path(path)
        name = Path(translated).name
        if name in HIDDEN_NAMES or Path(translated).suffix in {".db", ".py"}:
            return str(ROOT / "__missing__")
        return translated

    def read_body(self):
        try:
            length = int(self.headers.get("Content-Length", "0") or 0)
        except ValueError:
            length = 0
        if length > MAX_BODY:
            self.send_error(413, "File too large")
            return None
        return self.rfile.read(length) if length else b""

    def send_json(self, payload, status=200):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_bytes(self, data, content_type, extra_headers=None):
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        if extra_headers:
            for key, value in extra_headers.items():
                self.send_header(key, value)
        self.end_headers()
        self.wfile.write(data)

    def handle_api(self, method):
        parsed = urlparse(self.path)
        parts = [unquote(part) for part in parsed.path.strip("/").split("/") if part]

        if parts == ["api", "health"] and method == "GET":
            self.send_json({"ok": True, "database": str(DB_PATH)})
            return

        if parts == ["api", "state"] and method == "GET":
            raw = db_get_state()
            if raw is None:
                self.send_response(204)
                self.end_headers()
                return
            data = raw.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return

        if parts == ["api", "state"] and method in {"PUT", "POST"}:
            body = self.read_body()
            if body is None:
                return
            try:
                parsed_state = json.loads(body.decode("utf-8") or "{}")
                if not isinstance(parsed_state, dict):
                    raise ValueError("State must be an object")
            except (UnicodeDecodeError, json.JSONDecodeError, ValueError):
                self.send_error(400, "Invalid JSON")
                return
            db_put_state(json.dumps(parsed_state, ensure_ascii=False))
            self.send_json({"ok": True})
            return

        if parts == ["api", "files"] and method == "GET":
            self.send_json(db_list_files())
            return

        if len(parts) == 3 and parts[0] == "api" and parts[1] == "files":
            file_id = parts[2]
            if not file_id:
                self.send_error(400, "Missing file id")
                return
            if method == "GET":
                row = db_get_file(file_id)
                if not row:
                    self.send_error(404, "File not found")
                    return
                name, type_, data = row
                content_type = type_ or mimetypes.guess_type(name)[0] or "application/octet-stream"
                self.send_bytes(
                    data,
                    content_type,
                    {"X-File-Name": name, "Content-Disposition": f'inline; filename="{name}"'},
                )
                return
            if method == "PUT":
                body = self.read_body()
                if body is None:
                    return
                name = unquote(self.headers.get("X-File-Name", "file"))
                type_ = self.headers.get("Content-Type", "application/octet-stream").split(";")[0]
                db_put_file(file_id, name, type_, body)
                self.send_json({"ok": True, "id": file_id})
                return
            if method == "DELETE":
                db_delete_file(file_id)
                self.send_json({"ok": True})
                return

        self.send_error(404, "Unknown API route")


def main():
    os.chdir(ROOT)
    init_db()
    httpd = ThreadingHTTPServer((HOST, PORT), WindsorHandler)
    ip = lan_ip()
    print(f"Windsor database: {DB_PATH}", flush=True)
    print(f"Open on this computer: http://127.0.0.1:{PORT}", flush=True)
    print(f"Browse view:           http://127.0.0.1:{PORT}/browse.html", flush=True)
    if ip:
        print(f"Open on iPad:          http://{ip}:{PORT}", flush=True)
    print("Keep this window open while you use the app.", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
        httpd.server_close()


if __name__ == "__main__":
    main()
