"""wonjd-db — native Hermes tools calling db/query.py (Workspace bypass)."""

from __future__ import annotations

from .schemas import DB_LIST_TABLES_SCHEMA, DB_QUERY_SCHEMA
from .tools import (
    check_wonjd_db_available,
    bind_context,
    wonjd_db_list_tables,
    wonjd_db_query,
)


def register(ctx) -> None:
    bind_context(ctx)
    ctx.register_tool(
        name="wonjd_db_query",
        toolset="wonjd-db",
        schema=DB_QUERY_SCHEMA,
        handler=wonjd_db_query,
        check_fn=check_wonjd_db_available,
        emoji="🗄️",
    )
    ctx.register_tool(
        name="wonjd_db_list_tables",
        toolset="wonjd-db",
        schema=DB_LIST_TABLES_SCHEMA,
        handler=wonjd_db_list_tables,
        check_fn=check_wonjd_db_available,
        emoji="📋",
    )
