# WONJD_DB_CHAT_BOT

사내 **DB 조회** + **Obsidian vault(Markdown) 조회**용 로컬 RAG 챗봇.

UI는 [Hermes Workspace](https://github.com/outsourc-e/hermes-workspace)를 사용하고, 답변 LLM은 **Claude OAuth**(Claude Max + extra usage)를 사용한다.

상세 계약은 [`SPEC.md`](./SPEC.md)를 본다. (v0 초안 — RAG/vault 범위는 본 README 아키텍처를 우선한다.)

---

## 목적

- 자연어로 사내 DB를 조회한다 (read-only, SSL).
- Obsidian vault의 md 노트를 검색·인용해 답한다.
- 로컬에서 end-to-end로 검증한다.

---

## 아키텍처 (목표)

```text
[Hermes Workspace UI :3000/3001]
            |
            v
[Hermes Agent + Claude OAuth]
            |
            +-- NL → SQL → DB (SSL, SELECT only)
            |
            +-- RAG query
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

### 인덱싱 / 검색 파이프라인

| # | 단계 | 내용 |
| --- | --- | --- |
| 1 | 증분 인덱싱 | **Qdrant** 기반 증분 인덱싱 |
| 2 | 하이브리드 검색 | 단어(**BM25**) + 시맨틱(dense) |
| 3 | 의미론적 청킹 | 문장 간 유사도가 급격히 떨어지는 지점 기준 청킹 |
| 4 | Re-rank | **bge-reranker-v2-m3** |
| 5 | 답변 LLM | **Claude OAuth** |

### 스택

| 역할 | 선택 |
| --- | --- |
| 인덱싱 프레임워크 | **LlamaIndex** |
| 임베딩 | **BGE-M3** |
| Re-ranker | **bge-reranker-v2-m3** |
| Vector DB | **Qdrant** (로컬 **Docker**) |
| UI | Hermes Workspace (로컬 서버) |
| LLM | Claude OAuth |

---

## 소스

| 소스 | 용도 |
| --- | --- |
| 사내 / 로컬 덤프 DB | 수치·트랜잭션 조회 (NL→SQL) |
| Obsidian vault (`wonjd` 등) | md 지식·매뉴얼·이슈 문서 검색 |

---

## 로컬 실행 (초안)

### 전제

- Hermes Agent 설치 + Claude OAuth (`hermes auth add anthropic --type oauth`)
- Hermes Workspace: `pnpm dev` → `http://localhost:3001` (또는 3000)
- Qdrant: Docker Compose로 로컬 기동 (추가 예정)

### Qdrant (예정)

```bash
docker compose up -d qdrant
```

### Workspace UI

```bash
cd ~/hermes-workspace   # 또는 Documents/hermes-workspace
pnpm install
pnpm dev
```

Gateway API 서버가 필요하면 `~/.hermes/.env`에 `API_SERVER_ENABLED=true` 후 `hermes gateway restart`.

---

## 보안 (요약)

- DB: SSL 필수, 계정·앱 모두 **read-only (SELECT)**
- Claude: OAuth (API key 하드코딩 금지)
- 시크릿: `.env`만, 커밋 금지

---

## 문서

| 파일 | 내용 |
| --- | --- |
| [`SPEC.md`](./SPEC.md) | 제품 계약 (초안) |
| 본 README | 아키텍처·파이프라인·스택 |

---

## 변경 이력

| 날짜 | 내용 |
| --- | --- |
| 2026-08-26 | README 추가 — Qdrant 증분 인덱싱, 하이브리드, 의미 청킹, BGE-M3 / bge-reranker-v2-m3, LlamaIndex, Claude OAuth, Hermes UI |
