# WONJD_DB_CHAT_BOT

사내 **DB 조회** + **와이어프레임 PRD/자산 툴** + (예정) Obsidian vault 조회용 로컬 챗봇.

UI는 [Hermes Workspace](https://github.com/outsourc-e/hermes-workspace)를 사용하고, 답변 LLM은 **Claude OAuth**(Claude Max + extra usage)를 사용한다.

상세 계약은 [`SPEC.md`](./SPEC.md)를 본다.  
와이어프레임 SSOT·에이전트 계약: [`../wireframe_dashboard`](../wireframe_dashboard) · Hermes `WONJD.md`.

---

## 현재 구현 (2026-09-02)

**DB 조회 + Hermes Workspace 연동 + wonjd-wireframe 플러그인**까지 동작한다.

| 플러그인 | Workspace 툴 | 용도 |
| --- | --- | --- |
| `wonjd-db` | `wonjd_db_query`, `wonjd_db_list_tables` | CRM MySQL SELECT |
| `wonjd-wireframe` | `wonjd_prd_*`, `wonjd_wireframe_*`, `wonjd_assets_*` | PRD/HTML/JSON 자산 읽기·저장 |

- Workspace는 Windows MCP stdio 버그 우회를 위해 **Hermes 네이티브 플러그인**을 사용한다.
- Dashboard/TUI는 **MCP** (`wonjd_mcp`)를 유지한다.
- `wonjd-wireframe` 소스는 `wireframe_dashboard/hermes/plugin/wonjd-wireframe` (sibling 레포).

| 서비스 | 포트 | 용도 |
| --- | --- | --- |
| Gateway | **8642** | API · 플러그인 · MCP |
| Workspace | **3001** | 채팅 UI · WONJD 탭 |
| Dashboard | **9119** | Skills / Config (`start:all` 포함) |

---

## 빠른 시작

사전 조건: sibling으로 `../wireframe_dashboard`가 있어야 `wonjd-wireframe`이 설치된다.  
(`WIREFRAME_ROOT`로 경로 덮어쓰기 가능)

```bash
cp .env.example .env.local   # DB + HERMES_WORKSPACE / HERMES_WORKSPACE_DIR
uv sync
npm run mcp:install          # wonjd-db + wonjd-wireframe + CLI build + gateway restart
npm run db:check
npm run start:all            # gateway → dashboard → workspace
```

- Workspace: http://localhost:3001
- **새 채팅**을 열어야 플러그인 툴이 세션에 붙는다.

---

## npm scripts

| Script | 설명 |
| --- | --- |
| `start:all` | Gateway + Dashboard + Workspace |
| `start:workspace` | Workspace만 (sqlite3.exe + workspace 패치 포함) |
| `start:dashboard` | Dashboard `:9119` |
| `mcp:install` / `hermes:install` | db+wireframe 플러그인 · MCP · CLI build · gateway restart |
| `db:check` / `db:query` | DB CLI |

---

## 에이전트 툴 요약

**DB**

- `wonjd_db_list_tables` — 테이블 목록
- `wonjd_db_query` — SELECT only

**와이어프레임** (`wireframe_dashboard` 파일 SSOT)

| 툴 | 용도 |
| --- | --- |
| `wonjd_prd_list` / `wonjd_prd_get` / `wonjd_prd_save` | PRD 목록·읽기·저장 |
| `wonjd_wireframe_get` / `wonjd_wireframe_build` / `wonjd_wireframe_render` | HTML 조회·생성·화면 수정 |
| `wonjd_assets_list` / `wonjd_assets_get` | design/routes/api/db/shell (`query`로 필터) |

`api.json` / `db.json`은 전체 덤프하지 말고 `wonjd_assets_get`에 `query`를 넣는다.

---

## 트러블슈팅

| 증상 | 조치 |
| --- | --- |
| Workspace DB 실패 (`mcp__wonjd_db__*`) | `mcp:install` 후 새 채팅 — 플러그인 `wonjd_db_query` 사용 |
| wireframe 툴 없음 | `mcp:install` (sibling `wireframe_dashboard` 확인) 후 **새 채팅** |
| 첫 대화 `Operation interrupted.` | Workspace 재시작 (`patch-workspace-new-chat` 자동 적용) |
| Kanban `sqlite3 ENOENT` (Windows) | `start:workspace`가 `tools/sqlite3.exe` 설치 |
| Dashboard token fetch failed | `start:all` 사용 |

종료: `hermes gateway stop` / `hermes dashboard --stop`

---

## 구조

- `db/` — MySQL SELECT-only 조회
- `wonjd_mcp/` — Dashboard용 MCP
- `hermes/plugin/wonjd-db/` — Workspace용 DB 플러그인
- `../wireframe_dashboard/hermes/plugin/wonjd-wireframe/` — PRD/와이어프레임/자산 플러그인
- `scripts/install-mcp.mjs` / `install-plugin.mjs` — 플러그인 링크 + config
- `scripts/start-all-full.mjs` — 전체 기동
- `pyproject.toml` / `uv.lock` — Python deps

자세한 계약·RAG 로드맵: [`SPEC.md`](./SPEC.md)
