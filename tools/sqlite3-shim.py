"""Minimal sqlite3 CLI shim for Hermes Workspace kanban on Windows.

Usage: sqlite3 <db> -json "<sql>"
"""
from __future__ import annotations

import json
import sqlite3
import sys


def main() -> None:
    if len(sys.argv) != 4 or sys.argv[2] != "-json":
        print("usage: sqlite3 <db> -json <sql>", file=sys.stderr)
        raise SystemExit(2)

    db_path, sql = sys.argv[1], sys.argv[3]
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute(sql).fetchall()
    finally:
        conn.close()

    print(json.dumps([dict(row) for row in rows], ensure_ascii=False))


if __name__ == "__main__":
    main()
