# WONJD_DB_CHAT_BOT

사내 **DB 조회** + **Obsidian vault(Markdown) 조회**용 로컬 RAG 챗봇.

UI는 [Hermes Workspace](https://github.com/outsourc-e/hermes-workspace)를 사용하고, 답변 LLM은 **Claude OAuth**(Claude Max + extra usage)를 사용한다.

상세 계약은 [`SPEC.md`](./SPEC.md)를 본다.

---

## 현재 구현 (2026-08-28)

**DB 조회 + Hermes Workspace 연동**까지 동작한다.

Workspace는 Windows MCP stdio 버그 우회를 위해 **Hermes 네이티브 플러그인** (`wonjd-db`, `wonjd_db_query` / `wonjd_db_list_tables`)을 사용한다. Dashboard/TUI는 **MCP** (`wonjd_mcp`)를 유지한다.

| 서비스 | 포트 | 용도 |
| --- | --- | --- |
| Gateway | **8642** | API · 플러그인 · MCP |
| Workspace | **3001** | 채팅 UI |
| Dashboard | **9119** | Skills / Config (`start:all` 포함) |

---

## 빠른 시작

```bash
cp .env.example .env.local   # DB 설정
uv sync
npm run mcp:install          # plugin + MCP config
npm run db:check
npm run start:all            # gateway → dashboard → workspace
```

- Workspace: http://localhost:3001

---

## npm scripts

| Script | 설명 |
| --- | --- |
| `start:all` | Gateway + Dashboard + Workspace |
| `start:workspace` | Workspace만 (sqlite3.exe + workspace 패치 포함) |
| `start:dashboard` | Dashboard `:9119` |
| `mcp:install` / `hermes:install` | plugin + MCP 등록 + gateway restart |
| `db:check` / `db:query` | DB CLI |

---

## 트러블슈팅

| 증상 | 조치 |
| --- | --- |
| Workspace DB 실패 (`mcp__wonjd_db__*`) | `mcp:install` 후 새 채팅 — 플러그인 `wonjd_db_query` 사용 |
| 첫 대화 `Operation interrupted.` | Workspace 재시작 (`patch-workspace-new-chat` 자동 적용) |
| Kanban `sqlite3 ENOENT` (Windows) | `start:workspace`가 `tools/sqlite3.exe` 설치 |
| Dashboard token fetch failed | `start:all` 사용 |

종료: `hermes gateway stop` / `hermes dashboard --stop`

---

## 구조

- `db/` — MySQL SELECT-only 조회
- `wonjd_mcp/` — Dashboard용 MCP
- `hermes/plugin/wonjd-db/` — Workspace용 네이티브 플러그인
- `scripts/start-all-full.mjs` — 전체 기동
- `pyproject.toml` / `uv.lock` — Python deps

자세한 계약·RAG 로드맵: [`SPEC.md`](./SPEC.md)
