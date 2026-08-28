# /// script
# requires-python = ">=3.11"
# dependencies = ["sshtunnel>=0.4.0", "PyMySQL>=1.1.1", "python-dotenv>=1.0.1", "cryptography>=42"]
# ///
"""1단계 — MySQL에 붙어서 접속·스키마를 확인한다.

실행:
    uv run db/check_conn.py

모드:
  USE_SSH_TUNNEL=false  → 로컬 덤프 직결 (DB_HOST:DB_PORT)
  USE_SSH_TUNNEL=true   → SSH 터널 후 접속 (SSH_* → DB_REMOTE_*)

read-only 가드는 나중에. 로컬 덤프면 지금은 접속만 되면 통과.
"""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path

import pymysql
from dotenv import load_dotenv
from sshtunnel import SSHTunnelForwarder

ROOT = Path(__file__).resolve().parent.parent
ENV_CANDIDATES = (ROOT / ".env.local", ROOT / ".env")

# Windows 콘솔 기본 코드페이지(cp949)로 한글이 깨지는 걸 막는다
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

# MySQL 권한 이름 중 "쓰기/구조변경/관리" 계열. 참고용(지금은 경고만).
WRITE_PRIVS = {
    "ALL PRIVILEGES", "INSERT", "UPDATE", "DELETE", "DROP", "CREATE",
    "ALTER", "INDEX", "REFERENCES", "CREATE VIEW", "CREATE ROUTINE",
    "ALTER ROUTINE", "EXECUTE", "CREATE TEMPORARY TABLES", "LOCK TABLES",
    "TRIGGER", "EVENT", "FILE", "SUPER", "GRANT OPTION", "RELOAD", "SHUTDOWN",
    "CREATE USER", "CREATE TABLESPACE",
}


def ok(msg: str) -> None:
    print(f"  [OK]   {msg}")


def warn(msg: str) -> None:
    print(f"  [경고] {msg}")


def fail(msg: str) -> None:
    print(f"  [실패] {msg}")


def step(n: str, msg: str) -> None:
    print(f"\n[{n}] {msg}")


def need(key: str) -> str:
    val = (os.getenv(key) or "").strip()
    if not val:
        print(f"\n.env 의 {key} 가 비어 있다. 채우고 다시 실행해라.")
        sys.exit(1)
    return val


def load_env() -> Path:
    for path in ENV_CANDIDATES:
        if path.exists():
            load_dotenv(path, override=True)
            return path
    fail(f".env.local / .env 없음.  .env.example 을 복사해 채워라.")
    sys.exit(1)


def connect_mysql(*, host: str, port: int, user: str, password: str, database: str):
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


def inspect_db(conn, db_name: str) -> int:
    with conn.cursor() as cur:
        cur.execute("SELECT VERSION(), CURRENT_USER(), USER(), DATABASE()")
        version, current_user, login_user, cur_db = cur.fetchone()
    ok(f"서버 버전   {version}")
    ok(f"로그인 계정 {login_user}  →  권한 매칭 {current_user}")
    ok(f"현재 DB     {cur_db}")

    step("3", "권한 조사 (참고 — 로컬 덤프면 지금은 통과해도 됨)")
    with conn.cursor() as cur:
        cur.execute("SHOW GRANTS FOR CURRENT_USER()")
        grants = [row[0] for row in cur.fetchall()]

    offenders: set[str] = set()
    for g in grants:
        print(f"         {g}")
        m = re.match(r"GRANT\s+(.+?)\s+ON\s+", g, re.IGNORECASE | re.DOTALL)
        if not m:
            continue
        privs_blob = re.sub(r"\([^)]*\)", "", m.group(1))
        for p in privs_blob.split(","):
            p = p.strip().upper()
            if p in WRITE_PRIVS:
                offenders.add(p)

    print()
    if offenders:
        warn(f"쓰기/변경 권한 있음: {', '.join(sorted(offenders))} (로컬 덤프면 나중에 정리)")
    else:
        ok("쓰기/변경 권한 없음 — SELECT 계열만")

    step("4", f"읽기 확인 — `{db_name}` 테이블 목록")
    with conn.cursor() as cur:
        cur.execute(
            "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = %s",
            (db_name,),
        )
        (table_count,) = cur.fetchone()
        cur.execute(
            "SELECT table_name, table_rows FROM information_schema.tables "
            "WHERE table_schema = %s ORDER BY table_name LIMIT 10",
            (db_name,),
        )
        sample = cur.fetchall()
    ok(f"테이블 {table_count}개")
    for name, rows in sample:
        print(f"         {name:40s} ~{rows if rows is not None else '?'} rows")
    if table_count > len(sample):
        print(f"         ... 외 {table_count - len(sample)}개")

    print("\n1단계 통과. 접속 확인됐다.")
    return 0


def main() -> int:
    step("0", "환경변수 읽기")
    env_path = load_env()
    ok(str(env_path))

    use_tunnel = (os.getenv("USE_SSH_TUNNEL") or "true").strip().lower() in {
        "1", "true", "yes", "on",
    }

    db_name = need("DB_NAME")
    db_user = need("DB_USER")
    db_password = os.getenv("DB_PASSWORD") or ""

    tunnel = None
    conn = None
    try:
        if use_tunnel:
            ssh_host = need("SSH_HOST")
            ssh_port = int(os.getenv("SSH_PORT") or 22)
            ssh_user = need("SSH_USER")
            ssh_password = (os.getenv("SSH_PASSWORD") or "").strip() or None
            ssh_key = (os.getenv("SSH_KEY_PATH") or "").strip() or None
            ssh_key_pw = (os.getenv("SSH_KEY_PASSPHRASE") or "").strip() or None

            bind_host = os.getenv("SSH_LOCAL_BIND_HOST") or "127.0.0.1"
            bind_port = int(os.getenv("SSH_LOCAL_BIND_PORT") or 13306)
            db_remote_host = os.getenv("DB_REMOTE_HOST") or "127.0.0.1"
            db_remote_port = int(os.getenv("DB_REMOTE_PORT") or 3306)

            if ssh_key and not Path(ssh_key).expanduser().exists():
                fail(f"SSH_KEY_PATH 가 가리키는 파일이 없다: {ssh_key}")
                return 1
            if not ssh_key and not ssh_password:
                fail("SSH_PASSWORD 도 SSH_KEY_PATH 도 비어 있다. 둘 중 하나는 있어야 한다.")
                return 1

            auth = f"키({ssh_key})" if ssh_key else "비밀번호"
            step("1", f"SSH 터널 — {ssh_user}@{ssh_host}:{ssh_port} ({auth})")
            print(f"         {bind_host}:{bind_port}  ->  {db_remote_host}:{db_remote_port}")

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

            try:
                tunnel = SSHTunnelForwarder((ssh_host, ssh_port), **forwarder_kwargs)
                tunnel.start()
            except Exception as e:  # noqa: BLE001
                fail(f"터널을 열지 못했다: {type(e).__name__}: {e}")
                return 1

            ok(f"터널 열림 (local port {tunnel.local_bind_port})")
            host, port = bind_host, tunnel.local_bind_port
        else:
            host = os.getenv("DB_HOST") or "127.0.0.1"
            port = int(os.getenv("DB_PORT") or 3306)
            step("1", f"로컬 직결 — SSH 터널 생략 (USE_SSH_TUNNEL=false)")
            ok(f"{host}:{port}")

        step("2", f"MySQL 접속 — {db_user}@{host}:{port}/{db_name}")
        try:
            conn = connect_mysql(
                host=host,
                port=port,
                user=db_user,
                password=db_password,
                database=db_name,
            )
        except Exception as e:  # noqa: BLE001
            fail(f"접속 실패: {type(e).__name__}: {e}")
            print("\n  확인할 것: DB_USER / DB_PASSWORD / DB_NAME / 포트 / crm-mysql 기동")
            return 1

        return inspect_db(conn, db_name)

    finally:
        if conn is not None:
            conn.close()
        if tunnel is not None:
            tunnel.stop()
            print("(터널 닫음)")


if __name__ == "__main__":
    sys.exit(main())
