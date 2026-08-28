# /// script
# requires-python = ">=3.11"
# dependencies = ["sshtunnel>=0.4.0", "PyMySQL>=1.1.1", "python-dotenv>=1.0.1", "cryptography>=42"]
# ///
"""SELECT-only query runner (db_query tool core).

CLI:
    uv run db/query.py "SELECT COUNT(*) FROM ACCOUNT_MT"
    uv run db/query.py --sql "SELECT ..."
    uv run db/query.py --json "SELECT ..."
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import date, datetime, time
from decimal import Decimal
from pathlib import Path
from typing import Any

# Allow `uv run db/query.py` to import sibling conn.py
sys.path.insert(0, str(Path(__file__).resolve().parent))

from conn import load_env, open_db  # noqa: E402

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

FORBIDDEN = {
    "INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE", "TRUNCATE",
    "RENAME", "GRANT", "REVOKE", "SET", "COPY", "LOAD", "CALL", "MERGE", "UPSERT",
}

def strip_for_inspect(sql: str) -> str:
    """Remove comments and string literals so keyword checks ignore them."""
    out: list[str] = []
    i = 0
    n = len(sql)
    while i < n:
        ch = sql[i]
        nxt = sql[i + 1] if i + 1 < n else ""
        if ch == "-" and nxt == "-":
            i += 2
            while i < n and sql[i] not in "\r\n":
                i += 1
            continue
        if ch == "/" and nxt == "*":
            i += 2
            while i + 1 < n and not (sql[i] == "*" and sql[i + 1] == "/"):
                i += 1
            i = min(i + 2, n)
            continue
        if ch in ("'", '"', "`"):
            quote = ch
            out.append(" ")
            i += 1
            while i < n:
                if sql[i] == "\\" and quote != "`":
                    i += 2
                    continue
                if sql[i] == quote:
                    if quote != "`" and i + 1 < n and sql[i + 1] == quote:
                        i += 2
                        continue
                    i += 1
                    break
                i += 1
            continue
        out.append(ch)
        i += 1
    return "".join(out)

def _has_forbidden(inspected: str) -> str | None:
    for kw in FORBIDDEN:
        if re.search(rf"\b{kw}\b", inspected, re.IGNORECASE):
            return kw
    return None

def _is_select_or_cte(inspected: str) -> bool:
    s = inspected.strip()
    if not s:
        return False
    if re.match(r"(?is)^SELECT\b", s):
        return True
    if re.match(r"(?is)^WITH\b", s):
        return bool(re.search(r"(?is)\bSELECT\b", s))
    return False

def _has_top_level_limit(inspected: str) -> bool:
    return bool(re.search(r"(?is)\bLIMIT\b", inspected))

def guard_sql(sql: str) -> tuple[str | None, str | None]:
    """Return (executable_sql, reject_reason). reject_reason set => do not execute."""
    raw = (sql or "").strip()
    if not raw:
        return None, "empty_sql"

    inspected = strip_for_inspect(raw)
    # trailing semicolon ok; internal / multi-statement not
    body = inspected.strip().rstrip(";").strip()
    if ";" in body:
        return None, "multi_statement"

    if not _is_select_or_cte(body):
        return None, "not_select"

    bad = _has_forbidden(body)
    if bad:
        return None, f"forbidden_{bad.lower()}"

    max_rows = int(os.getenv("DB_MAX_ROWS") or 1000)
    executable = raw.rstrip().rstrip(";").rstrip()
    if not _has_top_level_limit(body):
        executable = f"{executable} LIMIT {max_rows}"
    return executable, None

def serialize_cell(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat(sep=" ")
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, time):
        return value.isoformat()
    if isinstance(value, Decimal):
        if value == value.to_integral_value():
            return int(value)
        return float(value)
    if isinstance(value, (bytes, bytearray, memoryview)):
        return bytes(value).hex()
    if isinstance(value, (int, float, str, bool)):
        return value
    return str(value)

def run_query(sql: str) -> dict:
    """Execute a guarded SELECT. Returns columns/rows or an error payload."""
    load_env()
    executable, reason = guard_sql(sql)
    if reason is not None:
        return {
            "sql": sql,
            "columns": [],
            "rows": [],
            "row_count": 0,
            "truncated": False,
            "error": "rejected_by_guard",
            "error_detail": reason,
        }

    assert executable is not None
    max_to_llm = int(os.getenv("DB_MAX_ROWS_TO_LLM") or 100)

    try:
        with open_db() as session:
            with session.conn.cursor() as cur:
                cur.execute(executable)
                columns = [d[0] for d in (cur.description or [])]
                fetched = cur.fetchall()
    except Exception as e:  # noqa: BLE001
        return {
            "sql": executable,
            "columns": [],
            "rows": [],
            "row_count": 0,
            "truncated": False,
            "error": "db_error",
            "error_detail": f"{type(e).__name__}: {e}",
        }

    row_count = len(fetched)
    truncated = row_count > max_to_llm
    rows = [
        [serialize_cell(cell) for cell in row]
        for row in fetched[:max_to_llm]
    ]
    return {
        "sql": executable,
        "columns": columns,
        "rows": rows,
        "row_count": row_count,
        "truncated": truncated,
    }

def _md_escape(val: Any) -> str:
    s = "" if val is None else str(val)
    return s.replace("|", "\\|").replace("\n", " ")

def to_markdown_table(result: dict) -> str:
    cols = result.get("columns") or []
    rows = result.get("rows") or []
    if not cols:
        return "_(no columns)_"
    header = "| " + " | ".join(_md_escape(c) for c in cols) + " |"
    sep = "| " + " | ".join("---" for _ in cols) + " |"
    body = [
        "| " + " | ".join(_md_escape(cell) for cell in row) + " |"
        for row in rows
    ]
    return "\n".join([header, sep, *body])

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="SELECT-only MySQL query runner")
    parser.add_argument("sql_positional", nargs="?", help="SQL to run")
    parser.add_argument("--sql", dest="sql_flag", help="SQL to run")
    parser.add_argument("--json", action="store_true", help="Print JSON only")
    args = parser.parse_args(argv)

    sql = args.sql_flag or args.sql_positional
    if not sql:
        parser.error("SQL required (positional or --sql)")

    result = run_query(sql)

    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0 if "error" not in result else 1

    print("SQL:")
    print(result.get("sql") or sql)
    print()
    if result.get("error"):
        print(f"error: {result['error']}")
        if result.get("error_detail"):
            print(f"detail: {result['error_detail']}")
        return 1
    print(to_markdown_table(result))
    print()
    print(f"row_count={result['row_count']} truncated={result['truncated']}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
