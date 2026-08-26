# 사내 DB 조회 챗봇 — 스펙 (초안)

- 문서 상태: Draft
- 작성일: 2026-08-26
- 프로젝트: `WONJD_DB_CHAT_BOT`
- 범위: v0 (로컬 검증용 최소 동작)

---

## 1. 목적

사내 DB를 **자연어로 조회**할 수 있는 챗봇을 만든다.
사용자는 SQL을 직접 쓰지 않아도 되고, 시스템은 쿼리를 생성·실행한 뒤 결과를 대화 형태로 돌려준다.

핵심 제약:

1. DB 접속은 **SSL/TLS만** 허용한다.
2. DB 권한은 **read-only (SELECT)** 만 허용한다.
3. LLM은 **Claude (OAuth)** 를 사용한다.
4. UI는 **Hermes 에이전트가 제공하는 UI** 를 그대로 사용한다.

---

## 2. 목표 / 비목표

### 2.1 목표 (Goals)

| ID | 목표 |
| --- | --- |
| G-1 | 자연어 질문 → SQL 생성 → DB 조회 → 결과 응답 파이프라인 |
| G-2 | 로컬 덤프 DB(`:8080`)에서 end-to-end 테스트 가능 |
| G-3 | 모든 DB 연결은 SSL 강제 |
| G-4 | 쓰기/DDL/위험 쿼리 차단 (read-only) |
| G-5 | Claude OAuth로 LLM 호출 |
| G-6 | Hermes 제공 UI로 채팅 인터페이스 구성 |

### 2.2 비목표 (Non-Goals) — v0

- 쓰기(INSERT/UPDATE/DELETE), DDL, 트랜잭션 제어
- 다중 DB / 멀티 테넌트
- 사용자별 세밀 RBAC (테이블·컬럼 ACL)
- 프로덕션 배포·모니터링·알림 체계
- 자체 커스텀 UI 제작
- 벡터 검색 / RAG 지식베이스 (스키마 설명 외)

---

## 3. 사용자 / 사용 시나리오

### 3.1 대상 사용자

- 사내 데이터 조회가 필요한 비개발·개발 사용자 (초안: 내부 인원)

### 3.2 대표 시나리오

1. 사용자가 Hermes UI에서 질문한다. 예: `"지난주 가입자 수 알려줘"`
2. 백엔드가 Claude(OAuth)에 스키마·질문 컨텍스트를 넘겨 SQL을 생성한다.
3. 생성된 SQL을 **안전 검사(read-only)** 후 로컬/회사 DB에 SSL로 실행한다.
4. 결과(테이블/요약)를 채팅으로 반환한다.
5. 실행 불가·권한·타임아웃 시 사용자에게 이유를 안내한다.

---

## 4. 시스템 구성

```
[Hermes Agent UI]
        |  (채팅)
        v
[Chat Backend / Agent Runtime]
        |
        |- Claude LLM (OAuth)
        |     · SQL 생성
        |     · 결과 요약(선택)
        |
        +- DB Connector (SSL only, read-only)
              · Local dump :8080  (dev)
              · Company DB       (later)
```

### 4.1 구성요소

| 구성요소 | 역할 | 비고 |
| --- | --- | --- |
| Hermes UI | 채팅 UI 제공 | 커스텀 UI 제작하지 않음 |
| Agent / Backend | 질의 접수, SQL 검증·실행, 응답 조립 | 구현 대상 |
| Claude (OAuth) | NL→SQL, 결과 해석 | API 키 대신 OAuth |
| DB | 조회 대상 | 로컬 덤프 → 이후 회사 DB |

---

## 5. 인증 / LLM

### 5.1 Claude OAuth

- LLM 호출은 Anthropic Claude OAuth 플로우를 사용한다.
- API key 하드코딩 금지.
- 토큰은 환경변수/시크릿 저장소에만 둔다.
- 토큰 만료·갱신 실패 시 UI에 재로그인/재인증 안내.

### 5.2 (초안) 앱 사용자 인증

- v0: 로컬 단일 사용자 가정 가능.
- 이후: 사내 SSO/계정 연동은 별도 스펙.

---

## 6. DB 접속 스펙

### 6.1 공통 규칙

| 항목 | 규칙 |
| --- | --- |
| 프로토콜 | SSL/TLS 필수 (`sslmode`/`require` 등 DB별 옵션으로 강제) |
| 계정 권한 | DB 계정 자체 read-only |
| 앱 레벨 가드 | SELECT 외 문장 거부 (이중 방어) |
| 타임아웃 | 쿼리 실행 타임아웃 필수 (초안: 30s, 설정 가능) |
| 결과 한도 | row limit / 응답 크기 제한 (초안: 1000 rows) |
| 자격증명 | `.env` / 시크릿만, 코드·로그 노출 금지 |

### 6.2 로컬 테스트 환경

| 항목 | 값 (초안) |
| --- | --- |
| 용도 | 덤프 DB로 e2e 검증 |
| 엔드포인트 | `localhost:8080` |
| SSL | 로컬도 SSL 경로로 통일 (자체서명/터널 포함 가능) |
| 데이터 | 회사 DB 덤프 (민감정보 마스킹 여부 TBD) |

> 확인 필요: `8080`이 DB 포트인지, 프록시/웹 콘솔 포트인지.
> 확정 전까지는 "로컬 덤프 접속점 = `:8080`"으로만 기술한다.

### 6.3 회사 DB (이후)

- 동일 인터페이스로 SSL + read-only 접속.
- 호스트/포트/인증서/계정은 배포 설정으로 분리.

---

## 7. 쿼리 안전 정책 (Read-only)

### 7.1 허용

- `SELECT` (단일 문장)
- `WITH ... SELECT` (CTE가 SELECT로만 끝나는 경우)
- `EXPLAIN` / `EXPLAIN ANALYZE` — **v0에서는 기본 비허용**, 필요 시 별도 플래그

### 7.2 거부 (예시)

- `INSERT` / `UPDATE` / `DELETE` / `MERGE`
- `DROP` / `ALTER` / `CREATE` / `TRUNCATE`
- `GRANT` / `REVOKE`
- `CALL` / 프로시저 실행
- 다중 스테이트먼트 (`;`로 이어진 실행)
- 파일 I/O, 복사, 외부 테이블 쓰기 계열

### 7.3 실행 전 검사 순서

1. SQL 파싱/정규화
2. 허용 문장 타입 검사
3. 금지 키워드·다중문 검사
4. LIMIT 강제(미지정 시 주입)
5. 실행 + 타임아웃
6. 결과 truncate / 요약

거부 시: 실행하지 않고 사유를 사용자에게 반환.

---

## 8. 대화 / 에이전트 동작

### 8.1 입력

- 사용자 자연어 질문
- (선택) 이전 대화 컨텍스트 N턴

### 8.2 처리 흐름

1. 스키마 요약(허용 테이블/컬럼 메타) + 질문 → Claude
2. Claude가 SQL 초안 생성
3. 안전 검사 통과 시 실행
4. 실패 시 1회 재작성 후 재시도(초안)
5. 결과 테이블 + 짧은 자연어 요약 반환
6. 필요 시 사용한 SQL을 UI에 노출(디버그 토글)

### 8.3 스키마 컨텍스트

- v0: 정적 스키마 문서/메타 테이블 스냅샷
- 전체 덤프를 매 요청에 넣지 않음 (토큰·보안)

---

## 9. UI (Hermes)

| 항목 | 내용 |
| --- | --- |
| 제공처 | Hermes 에이전트 기본 UI |
| 범위 | 채팅 입력, 응답 표시, (가능 시) 표/코드 블록 |
| 커스텀 | v0에서 별도 프론트 개발 없음 |
| 연동 | Hermes가 기대하는 agent/tool 인터페이스에 백엔드 맞춤 |

Hermes UI가 표 렌더를 지원하면 조회 결과는 표 우선.
미지원이면 markdown/텍스트로 폴백.

---

## 10. 설정 (초안)

환경변수 예시 (이름 확정 전):

```env
# LLM
CLAUDE_OAUTH_TOKEN=...

# DB (local)
DB_HOST=localhost
DB_PORT=8080
DB_NAME=...
DB_USER=readonly_user
DB_PASSWORD=...
DB_SSL=require

# Safety
DB_QUERY_TIMEOUT_SEC=30
DB_MAX_ROWS=1000
```

---

## 11. 보안 / 컴플라이언스 (초안)

- DB·LLM 자격증명 코드 커밋 금지
- 쿼리/결과 로그에 PII 최소화 (마스킹 정책 TBD)
- SSL 검증 우회(`rejectUnauthorized=false` 등)는 로컬 임시만, 문서화 필수
- read-only DB 계정 + 앱 가드 이중 적용
- 프롬프트 인젝션으로 쓰기 SQL이 나와도 실행 단계에서 차단

---

## 12. 수용 기준 (Acceptance Criteria)

| ID | Given | When | Then |
| --- | --- | --- | --- |
| AC-1 | 로컬 `:8080` 덤프 DB가 떠 있다 | 사용자가 조회 질문을 보낸다 | SELECT 결과가 Hermes UI에 표시된다 |
| AC-2 | Claude OAuth가 유효하다 | 질문이 들어온다 | OAuth로 Claude가 호출되고 SQL이 생성된다 |
| AC-3 | 모델이 `DELETE` SQL을 냈다 | 실행 직전 검사한다 | 실행되지 않고 거부 사유가 반환된다 |
| AC-4 | DB SSL 설정이 require다 | 커넥터가 연결한다 | 비SSL 연결은 실패한다 |
| AC-5 | 결과가 1000행을 넘는다 | 조회한다 | row limit가 적용되고 잘렸다는 안내가 나온다 |
| AC-6 | 쿼리가 30초를 넘긴다 | 실행한다 | 타임아웃으로 중단되고 오류가 안내된다 |
| AC-7 | OAuth 토큰이 만료됐다 | LLM 호출을 시도한다 | 재인증 안내가 나온다 |

---

## 13. 마일스톤 (초안)

| Phase | 내용 | 완료 조건 |
| --- | --- | --- |
| P0 | 스펙 확정 + 로컬 DB 접속 확인 | SSL + read-only 접속 성공 |
| P1 | Claude OAuth + NL→SQL | 로컬에서 SQL 생성 가능 |
| P2 | 안전 가드 + 실행 + 결과 반환 | AC-1~AC-6 통과 |
| P3 | Hermes UI 연동 | Hermes에서 e2e 질의 가능 |
| P4 | 회사 DB SSL 전환 | 로컬과 동일 인터페이스로 전환 |

---

## 14. 미확정 / 결정 필요

| # | 항목 | 현재 가정 | 결정 필요 |
| --- | --- | --- | --- |
| Q1 | `:8080`의 실체 | 로컬 덤프 접속점 | DB 포트 vs 프록시/콘솔 |
| Q2 | DB 엔진 | 미정 | MySQL / Postgres / 기타 |
| Q3 | Hermes 연동 방식 | Hermes 제공 UI/런타임 사용 | tool/schema 계약 |
| Q4 | Claude 모델명 | 미정 | 예: Sonnet / Opus |
| Q5 | SQL 노출 여부 | 디버그 토글 | 기본 노출 vs 숨김 |
| Q6 | 덤프 데이터 민감정보 | 미정 | 마스킹 필요 여부 |
| Q7 | 앱 로그인 | v0 생략 가능 | 사내 인증 필요 시점 |

---

## 15. 변경 이력

| 날짜 | 내용 |
| --- | --- |
| 2026-08-26 | 초안 작성 (SSL, read-only, local:8080, Claude OAuth, Hermes UI) |
