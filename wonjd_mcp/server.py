# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "mcp>=1.2.0,<2",
#   "sshtunnel>=0.4.0",
#   "PyMySQL>=1.1.1",
#   "python-dotenv>=1.0.1",
#   "cryptography>=42",
# ]
# ///
"""WONJD CRM DB — MCP stdio server for Hermes.

Tools:
  db_query(sql)       — SELECT-only, .env.local connection
  db_list_tables()    — table names + row estimates
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Import MCP SDK before adding db/ (avoid any local name shadowing)
from mcp.server.fastmcp import FastMCP

sys.path.insert(0, str(ROOT / "db"))
from query import run_query  # noqa: E402

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

app = FastMCP(
    "wonjd-db",
    instructions=(
        "Read-only CRM MySQL (local dump or SSH tunnel per .env.local). "
        "Use db_list_tables to discover schema, then db_query with SELECT."
    ),
)


@app.tool()
def db_query(sql: str) -> str:
    """Execute a read-only SELECT against the CRM database.

    Args:
        sql: A single SELECT or WITH...SELECT statement.

    Returns:
        JSON: {sql, columns, rows, row_count, truncated, error?, error_detail?}
    """
    result = run_query(sql)
    return json.dumps(result, ensure_ascii=False, indent=2)


@app.tool()
def db_list_tables(limit: int = 50) -> str:
    """List tables in the current database with approximate row counts.

    Args:
        limit: Max tables to return (default 50).
    """
    n = max(1, min(int(limit), 200))
    result = run_query(
        "SELECT table_name, table_rows FROM information_schema.tables "
        "WHERE table_schema = DATABASE() ORDER BY table_name "
        f"LIMIT {n}"
    )
    return json.dumps(result, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    app.run()
