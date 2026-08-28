# /// script
# requires-python = ">=3.11"
# dependencies = ["sshtunnel>=0.4.0", "PyMySQL>=1.1.1", "python-dotenv>=1.0.1", "cryptography>=42"]
# ///
"""Shared MySQL connection helper."""

from __future__ import annotations

import os
import sys
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator

import pymysql
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
ENV_CANDIDATES = (ROOT / ".env.local", ROOT / ".env")

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

@dataclass
class DbSession:
    conn: pymysql.connections.Connection
    host: str
    port: int
    database: str
    user: str
    via_tunnel: bool

def load_env() -> Path:
    for path in ENV_CANDIDATES:
        if path.exists():
            load_dotenv(path, override=True)
            return path
    raise FileNotFoundError(".env.local / .env missing")

def _need(key: str) -> str:
    val = (os.getenv(key) or "").strip()
    if not val:
        raise ValueError(f"empty env: {key}")
    return val

def _truthy(val, *, default=False):
    raw = (val if val is not None else ("true" if default else "false")).strip().lower()
    return raw in {"1", "true", "yes", "on"}

def connect_mysql(*, host, port, user, password, database):
    return pymysql.connect(
        host=host,
        port=port,
        user=user,
        password=password,
        database=database,
        charset="utf8mb4",
        connect_timeout=10,
        read_timeout=int(os.getenv("DB_QUERY_TIMEOUT_SEC") or 30),
        autocommit=True,
        cursorclass=pymysql.cursors.Cursor,
    )

@contextmanager
def open_db() -> Iterator[DbSession]:
    """Yield a live MySQL session; closes conn / tunnel on exit."""
    from sshtunnel import SSHTunnelForwarder

    load_env()
    use_tunnel = _truthy(os.getenv("USE_SSH_TUNNEL"), default=False)
    db_name = _need("DB_NAME")
    db_user = _need("DB_USER")
    db_password = os.getenv("DB_PASSWORD") or ""

    tunnel = None
    conn = None
    try:
        if use_tunnel:
            ssh_host = _need("SSH_HOST")
            ssh_port = int(os.getenv("SSH_PORT") or 22)
            ssh_user = _need("SSH_USER")
            ssh_password = (os.getenv("SSH_PASSWORD") or "").strip() or None
            ssh_key = (os.getenv("SSH_KEY_PATH") or "").strip() or None
            ssh_key_pw = (os.getenv("SSH_KEY_PASSPHRASE") or "").strip() or None
            bind_host = os.getenv("SSH_LOCAL_BIND_HOST") or "127.0.0.1"
            bind_port = int(os.getenv("SSH_LOCAL_BIND_PORT") or 13306)
            db_remote_host = os.getenv("DB_REMOTE_HOST") or "127.0.0.1"
            db_remote_port = int(os.getenv("DB_REMOTE_PORT") or 3306)
            if ssh_key and not Path(ssh_key).expanduser().exists():
                raise FileNotFoundError(f"SSH_KEY_PATH file not found: {ssh_key}")
            if not ssh_key and not ssh_password:
                raise ValueError("SSH_PASSWORD and SSH_KEY_PATH are both empty; one is required.")
            forwarder_kwargs = {
                "ssh_username": ssh_user,
                "remote_bind_address": (db_remote_host, db_remote_port),
                "local_bind_address": (bind_host, bind_port),
                "set_keepalive": 30.0,
            }
            if ssh_key:
                forwarder_kwargs["ssh_pkey"] = str(Path(ssh_key).expanduser())
                if ssh_key_pw:
                    forwarder_kwargs["ssh_private_key_password"] = ssh_key_pw
            else:
                forwarder_kwargs["ssh_password"] = ssh_password
            tunnel = SSHTunnelForwarder((ssh_host, ssh_port), **forwarder_kwargs)
            tunnel.start()
            host, port = bind_host, int(tunnel.local_bind_port)
        else:
            host = os.getenv("DB_HOST") or "127.0.0.1"
            port = int(os.getenv("DB_PORT") or 3306)
        conn = connect_mysql(
            host=host, port=port, user=db_user, password=db_password, database=db_name,
        )
        yield DbSession(
            conn=conn, host=host, port=port, database=db_name, user=db_user, via_tunnel=use_tunnel,
        )
    finally:
        if conn is not None:
            conn.close()
        if tunnel is not None:
            tunnel.stop()
