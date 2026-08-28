"""Tool schemas for wonjd-db Hermes plugin."""

DB_QUERY_SCHEMA = {
    "name": "wonjd_db_query",
    "description": (
        "Execute a read-only SELECT against the WONJD CRM MySQL database. "
        "Use wonjd_db_list_tables first to discover schema. Returns JSON with "
        "columns, rows, row_count, truncated."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "sql": {
                "type": "string",
                "description": "A single SELECT or WITH...SELECT statement.",
            },
        },
        "required": ["sql"],
    },
}

DB_LIST_TABLES_SCHEMA = {
    "name": "wonjd_db_list_tables",
    "description": (
        "List tables in the CRM database with approximate row counts "
        "(information_schema.tables)."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "limit": {
                "type": "integer",
                "description": "Max tables to return (default 50, max 200).",
            },
        },
    },
}
