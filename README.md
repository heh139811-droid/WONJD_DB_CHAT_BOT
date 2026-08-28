# WONJD_DB_CHAT_BOT

사내 **DB 조회** + **Obsidian vault(Markdown) 조회**용 로컬 RAG 챗봇.

UI는 [Hermes Workspace](https://github.com/outsourc-e/hermes-workspace)를 사용하고, 답변 LLM은 **Claude OAuth**(Claude Max + extra usage)를 사용한다.

상세 계약은 [`SPEC.md`](./SPEC.md)를 본다 (v1 — 본 README 아키텍처를 반영).

**범위 우선순위**: 1차는 **vault RAG + DB 조회 기능 전부**(권한 분리 없이 — 누구나 모든 데이터 조회), 2차는 **권한 정책 부착**(사내 접속권한 정책).

---

## 목적

- 자연어로 사내 DB를 조회한다 (read-only, SSL).
- Obsidian vault의 md 노트를 검색·인용해 답한다.
- 로컬에서 end-to-end로 검증한다.

---

## 현재 구현 (2026-08-28)

**DB 조회 + Hermes MCP**까지 동작한다. vault RAG(Qdrant·임베딩·re-rank)는 이후 단계.

```text
[Hermes Workspace UI :3001]
            |
            v
[Hermes Gateway :8642]  ← MCP stdio (wonjd-db)
            |
            v
[Hermes Agent + Claude OAuth (anthropic)]
            |
            +-- db_query / db_list_tables  (MCP wonjd-db)
            |         |
            |         v
            |   [db/query.py] SELECT-only guard
            |         |
            |         v
            |   [db/conn.py] MySQL (직결 or SSH 터널)
            |
            +-- (예정) RAG query → Qdrant hybrid retrieval
```

| 서비스 | 포트 | 용도 |
| --- | --- | --- |
| Hermes Gateway | **8642** | API · MCP subprocess 호스트 (`HERMES_API_URL`) |
| Hermes Workspace | **3001** | 채팅 UI (`pnpm dev`) |
| Hermes Dashboard | **9119** | MCP / Skills / Config 탭 (`npm run start:dashboard`) |

---

## DB 레이어 (`db/`)

| 파일 | 역할 |
| --- | --- |
| [`db/conn.py`](./db/conn.py) | `.env.local` 로드, MySQL 연결. `USE_SSH_TUNNEL=true`면 SSH 터널 후 접속 |
| [`db/query.py`](./db/query.py) | SELECT-only SQL 가드 + 실행. `LIMIT` 자동 부착, `DB_MAX_ROWS` / `DB_MAX_ROWS_TO_LLM` 적용 |
| [`db/check_conn.py`](./db/check_conn.py) | 1단계 연결·스키마 점검 CLI |

가드: `INSERT`/`UPDATE`/`DELETE` 등 금지 키워드, 다중 문장 거부, `SELECT`/`WITH…SELECT`만 허용.

```bash
npm run db:check                              # 연결·권한·테이블 샘플 확인
npm run db:query -- "SELECT COUNT(*) FROM …"  # CLI 조회 (--json 지원)
```

---

## MCP — `wonjd-db` (`wonjd_mcp/`)

Hermes stdio MCP 서버. [`wonjd_mcp/server.py`](./wonjd_mcp/server.py)가 `db/query.py`를 재사용한다.

| Tool | 설명 |
| --- | --- |
| `db_query(sql)` | read-only SELECT 실행 → JSON `{columns, rows, row_count, truncated, error?}` |
| `db_list_tables(limit?)` | 현재 DB 테이블 목록 + 대략적 row 수 |

설정 스니펫: [`hermes/wonjd-db.mcp.yaml`](./hermes/wonjd-db.mcp.yaml)  
`npm run mcp:install`이 `%LOCALAPPDATA%/hermes/config.yaml`에 `mcp_servers.wonjd-db`와 `platform_toolsets.api_server`(`mcp-wonjd-db`)를 등록한다.

```bash
npm run mcp:install   # config 등록 + hermes mcp test wonjd-db
npm run mcp:test      # MCP 연결 재검증
```

---

## 아키텍처 (목표 — RAG 포함)

```text
[Hermes Workspace UI :3001]
            |
            v
[Hermes Agent + Claude OAuth]
            |
            +-- NL → SQL → DB (SSL, SELECT only)  ← 구현됨 (MCP)
            |
            +-- RAG query  ← 예정
                    |
                    v
            [Hybrid retrieval]
              BM25 + dense (BGE-M3)
                    |
                    v
            [Re-rank: bge-reranker-v2-m3]
                    |
                    v
            [Claude OAuth] 답변 + 출처
```

### 인덱싱 / 검색 파이프라인 (예정)

| # | 단계 | 내용 |
| --- | --- | --- |
| 1 | 증분 인덱싱 | **Qdrant** 기반 증분 인덱싱 |
| 2 | 하이브리드 검색 | 단어(**BM25**) + 시맨틱(dense) |
| 3 | 의미론적 청킹 | **LangChain `SemanticChunker`** |
| 4 | Re-rank | **bge-reranker-v2-m3** |
| 5 | 답변 LLM | **Claude OAuth** |

### 스택

| 역할 | 선택 | 상태 |
| --- | --- | --- |
| DB 조회 | PyMySQL + SSH tunnel, SELECT guard | **구현** |
| MCP | Hermes `wonjd-db` stdio | **구현** |
| UI | Hermes Workspace `:3001` | **구현** |
| Gateway | Hermes `:8642` | **구현** |
| Dashboard | Hermes `:9119` (MCP 탭) | **구현** |
| Vector DB | **Qdrant** `:6333` | 예정 |
| 임베딩 / Re-ranker | BGE-M3 `:8081`, bge-reranker-v2-m3 `:8082` | 예정 |
| LLM | Claude OAuth (`anthropic`) | **구현** |

---

## 소스

| 소스 | 용도 |
| --- | --- |
| 사내 / 로컬 덤프 DB | 수치·트랜잭션 조회 (NL→SQL via MCP) |
| Obsidian vault (`wonjd` 등) | md 지식·매뉴얼·이슈 문서 검색 (예정) |

---

## 프로젝트 구조

```text
WONJD_DB_CHAT_BOT/
├── db/
│   ├── conn.py
│   ├── query.py
│   └── check_conn.py
├── wonjd_mcp/
│   └── server.py
├── hermes/
│   └── wonjd-db.mcp.yaml
├── scripts/
│   ├── start-all.mjs
│   ├── start-workspace.mjs
│   ├── start-dashboard.mjs
│   ├── install-mcp.mjs
│   └── setup-hermes-path.ps1
├── .env.example
├── .env.local
├── package.json
├── README.md
└── SPEC.md
```

---

## 설정 · 실행

### 1. 환경변수

```bash
cp .env.example .env.local
```

로컬 덤프 직결: `USE_SSH_TUNNEL=false`, `DB_HOST`/`DB_PORT` 설정.  
사내 bastion: `USE_SSH_TUNNEL=true`, `SSH_*` + `DB_REMOTE_*` 설정.

### 2. Hermes + Claude OAuth

```bash
hermes auth add anthropic --type oauth
hermes model set anthropic
```

Hermes Workspace 클론이 `HERMES_WORKSPACE`(기본: `Documents/hermes-workspace`)에 있어야 한다.

### 3. DB 연결 확인

```bash
npm run db:check
```

### 4. MCP 등록

```bash
npm run mcp:install
hermes gateway restart
```

### 5. UI 기동

```bash
npm run start:all
npm run start:dashboard
```

- Workspace: `http://localhost:3001`
- Gateway health: `http://127.0.0.1:8642/health`
- Dashboard (MCP): `http://127.0.0.1:9119`

Gateway가 healthy면 `start:all`은 workspace만 띄운다.

---

## npm scripts

| Script | 설명 |
| --- | --- |
| `start:all` | Gateway + Workspace |
| `start:gateway` | `hermes gateway run` |
| `start:workspace` | Workspace `pnpm dev` |
| `start:dashboard` | Dashboard `:9119` |
| `setup:hermes-path` | Windows PATH |
| `db:check` | DB 연결 점검 |
| `db:query` | CLI SELECT |
| `mcp:install` | MCP 등록 + 테스트 |
| `mcp:test` | `hermes mcp test wonjd-db` |

---

## 트러블슈팅

| 증상 | 조치 |
| --- | --- |
| MCP subprocess exit | `hermes gateway restart` + **새 채팅** |
| MCP 탭 비어 있음 | `npm run start:dashboard` |
| rejected_by_guard | SELECT/`WITH`만 허용 |
| DB 연결 실패 | `npm run db:check` |
| Gateway unhealthy | `hermes gateway restart` |

---

## 보안 (요약)

- DB: read-only, SELECT-only 가드
- Claude: OAuth, API key 금지
- 시크릿: `.env.local` 커밋 금지
- 로컬 바인딩: `127.0.0.1`

---

## 문서

| 파일 | 내용 |
| --- | --- |
| [`SPEC.md`](./SPEC.md) | 제품 계약 |
| 본 README | 구현·실행·MCP·DB |

---

## 변경 이력

| 날짜 | 내용 |
| --- | --- |
| 2026-08-26 | README 추가 |
| 2026-08-28 | DB/MCP/Hermes 통합, npm scripts, 트러블슈팅 |
