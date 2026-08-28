"""Quick smoke test for wonjd-db Hermes plugin handlers."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "hermes" / "plugin" / "wonjd-db"))

from tools import bind_context, wonjd_db_list_tables, wonjd_db_query  # noqa: E402


class _Ctx:
    def get_config(self, key: str) -> str:
        return str(ROOT).replace("\\", "/")


bind_context(_Ctx())
print("list_tables:", wonjd_db_list_tables({"limit": 3})[:300])
print(
    "query:",
    wonjd_db_query(
        {"sql": "SELECT MAX(CREATED_AT) AS max_created FROM CONTRACT_MT"}
    )[:300],
)
