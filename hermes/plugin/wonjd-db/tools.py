"""Handlers — spawn project venv db/query.py (no stdio MCP)."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

_LIST_TABLES_SQL = (
    "SELECT table_name, table_rows FROM information_schema.tables "
    "WHERE table_schema = DATABASE() ORDER BY table_name LIMIT {limit}"
)

_ctx = None


def bind_context(ctx) -> None:
    global _ctx
    _ctx = ctx


def _project_root() -> Path:
    if _ctx is not None:
        configured = (_ctx.get_config("project_root") or "").strip()
        if configured:
            return Path(configured)
    env = (os.environ.get("WONJD_DB_ROOT") or os.environ.get("WONJD_PROJECT_ROOT") or "").strip()
    if env:
        return Path(env)
    raise RuntimeError(
        "wonjd-db plugin: project_root not configured. Run: npm run mcp:install"
    )


def _python_exe(root: Path) -> Path:
    if sys.platform == "win32":
        return root / ".venv" / "Scripts" / "python.exe"
    return root / ".venv" / "bin" / "python"


def check_wonjd_db_available() -> bool:
    try:
        root = _project_root()
        return _python_exe(root).is_file() and (root / "db" / "query.py").is_file()
    except Exception:
        return False


def _run_query(sql: str) -> dict:
    root = _project_root()
    py = _python_exe(root)
    script = root / "db" / "query.py"
    if not py.is_file():
        raise FileNotFoundError(f"missing venv python: {py} (run: uv sync)")
    if not script.is_file():
        raise FileNotFoundError(f"missing {script}")

    proc = subprocess.run(
        [str(py), str(script), "--json", sql],
        cwd=str(root),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=int(os.environ.get("DB_QUERY_TIMEOUT_SEC") or 180),
    )
    if proc.returncode != 0 and not proc.stdout.strip():
        raise RuntimeError((proc.stderr or proc.stdout or "query failed").strip()[:2000])

    try:
        result = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"invalid query output: {exc}\n{proc.stdout[:500]}") from exc
    if not isinstance(result, dict):
        raise RuntimeError("query output was not a JSON object")
    return result


def wonjd_db_query(args: dict, **kwargs) -> str:
    sql = str(args.get("sql") or "").strip()
    if not sql:
        return json.dumps({"error": "sql is required"})
    try:
        return json.dumps(_run_query(sql), ensure_ascii=False)
    except Exception as exc:
        return json.dumps({"error": type(exc).__name__, "error_detail": str(exc)})


def wonjd_db_list_tables(args: dict, **kwargs) -> str:
    try:
        limit = int(args.get("limit") or 50)
    except (TypeError, ValueError):
        limit = 50
    limit = max(1, min(limit, 200))
    try:
        return json.dumps(_run_query(_LIST_TABLES_SQL.format(limit=limit)), ensure_ascii=False)
    except Exception as exc:
        return json.dumps({"error": type(exc).__name__, "error_detail": str(exc)})
