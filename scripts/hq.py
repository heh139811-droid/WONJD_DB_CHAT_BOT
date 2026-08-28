"""Ad-hoc read-only query helper: drives the wonjd-db MCP server over stdio.

Usage:  uv run scripts/hq.py "SELECT 1"
"""
import json
import subprocess
import sys

UV = "C:/Users/PC/AppData/Local/hermes/bin/uv.exe"
SERVER = "C:/Users/PC/Documents/WONJD_DB_CHAT_BOT/wonjd_mcp/server.py"


def run(sql: str) -> dict:
    msgs = [
        {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {
            "protocolVersion": "2024-11-05", "capabilities": {},
            "clientInfo": {"name": "hq", "version": "1"}}},
        {"jsonrpc": "2.0", "method": "notifications/initialized"},
        {"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {
            "name": "db_query", "arguments": {"sql": sql}}},
    ]
    payload = "".join(json.dumps(m) + "\n" for m in msgs)
    proc = subprocess.run(
        [UV, "run", SERVER], input=payload, capture_output=True, text=True, timeout=180
    )
    for line in proc.stdout.splitlines():
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue
        if obj.get("id") == 2:
            return json.loads(obj["result"]["content"][0]["text"])
    raise RuntimeError(f"no result\nstdout={proc.stdout[:2000]}\nstderr={proc.stderr[:2000]}")


if __name__ == "__main__":
    print(json.dumps(run(sys.argv[1]), ensure_ascii=False, indent=2))
