---
title: Mneme MVP Specification
version: 0.2
status: draft
updated: 2026-06-21
language: ko
---

# Mneme MVP 명세

## 1. MVP 목표

MVP의 목표는 완성형 에이전트 플랫폼이 아니다. 첫 번째 검증 목표는 다음이다.

> 사용자가 Claude Code 또는 Codex CLI에 로그인한 계정 세션을 Mneme에 위임하고, 자료를 추가하면 Mneme가 원문을 보존하며, Wiki 변경안을 생성하고, 검수 후 Git-backed Markdown Wiki에 반영하는 end-to-end 흐름을 증명한다.

즉 MVP는 자기개선이 안전하게 일어날 수 있는 **Provider delegated auth, 진실원천, 제안, 검수, 반영, 파생 인덱스**의 뼈대를 검증한다.

## 2. 성공 기준

MVP는 다음이 가능해야 성공이다.

1. 사용자가 Work 또는 Personal Vault를 선택한다.
2. 사용자가 `Use Claude Code CLI session` 또는 `Use Codex ChatGPT session`으로 Provider를 선택한다.
3. Mneme가 Provider CLI 로그인 상태를 확인한다.
4. 미로그인 상태이면 사용자에게 `claude` 또는 `codex login` 같은 login hint를 보여준다.
5. 로그인 상태이면 연결된 계정 label, auth mode, capability가 표시된다.
6. API key fallback을 선택한 경우에만 Mneme가 OS credential store에 key를 저장한다.
7. 사용자가 URL, 텍스트, 로컬 파일 중 하나를 추가한다.
8. raw 원문이 Vault 안에 저장되고 Git commit으로 남는다.
9. 시스템이 연결된 Provider를 사용해 Wiki page 변경안을 생성한다.
10. 변경안은 proposal branch 또는 patch로 저장된다.
11. 사용자가 diff를 보고 승인 또는 거부한다.
12. 승인된 변경안은 Git commit으로 반영된다.
13. `wiki/index.md`, `wiki/log.md`, `wiki/processed.md`가 갱신된다.
14. Graph/native memory/search cache는 원본에서 rebuild 가능하다.
15. 사용자가 저장된 지식에 대해 질문하고 출처 포함 답변을 받는다.

## 3. MVP 범위

### 3.1 포함

Product:

- Desktop local app
- Headless Core
- Local IPC
- Single machine local storage
- Work/Personal Vault
- Chat-based usage
- Review-based approval
- Basic graph data generation

Auth:

- Delegated CLI auth first
- `Use Claude Code CLI session`
- `Use Codex ChatGPT session`
- API key fallback
- secure API key storage
- login hint
- needs reauth status
- revoke connection
- connected account label

Knowledge:

- URL ingest
- Text ingest
- Local file ingest
- Raw source preservation
- Markdown page generation
- Frontmatter validation
- Source citation
- Wiki index/log/processed update

Provider:

- 첫 Provider 1개 연결
- Claude Code first
- Codex/ChatGPT sign-in second candidate
- Provider capability check
- Provider execution result normalization
- Provider output converted to proposal

Policy:

- Work Vault default: Review apply, Ask parallel
- Personal Vault default: Auto apply, Auto parallel
- Capability downgrade
- Budget downgrade

Review:

- Proposal list
- Diff view
- Approve
- Reject
- Regenerate when stale/conflict

### 3.2 제외

- 다중 Provider 동시 지원
- Hermes Adapter
- Antigravity remote worker
- Telegram/Web client
- Cloud sync
- Team collaboration
- Full graph UI polish
- Advanced semantic search
- Image/audio ingest
- PDF 고급 파싱
- Provider별 병렬 agent team orchestration
- 자동 skill generation
- Client-side provider secret storage

## 4. 사용자 흐름

### 4.1 Connect Provider

```text
Provider Settings
  -> Use Claude Code CLI session 또는 Use Codex ChatGPT session
  -> Headless Core asks Provider Adapter for CLI auth status
  -> if not logged in: show provider-owned login hint
  -> user logs in through provider CLI
  -> Mneme re-checks status
  -> auth status and capability matrix displayed
```

Acceptance criteria:

- Claude/ChatGPT 구독 OAuth token은 Mneme로 추출되지 않는다.
- API key는 client에 노출되지 않는다.
- 연결된 계정 label은 표시된다.
- delegated session이 없거나 만료되면 re-login 필요 상태가 표시된다.
- API key mode에서만 revoke/remove가 secure store credential을 삭제한다.

### 4.2 Add This

```text
사용자 입력
  -> Vault 선택
  -> raw 원문 저장
  -> raw commit
  -> Provider 요약/추출
  -> Wiki 변경안 생성
  -> Review gate
  -> 승인 시 merge/commit
  -> cache rebuild
```

Acceptance criteria:

- raw 원문은 수정되지 않는다.
- raw 저장과 page synthesis는 별도 단계다.
- page synthesis는 승인 전까지 main Wiki에 들어가지 않는다.
- source-id가 page frontmatter에 남는다.

### 4.3 Ask

```text
질문
  -> Vault 내부 index/memory map 검색
  -> 관련 pages 로드
  -> 출처 포함 답변
  -> save that 선택 가능
```

Acceptance criteria:

- 다른 Vault의 지식은 검색하지 않는다.
- 답변에는 사용한 page/source가 표시된다.
- 저장 요청 없이는 답변이 Wiki에 반영되지 않는다.

### 4.4 Save That

```text
답변 선택
  -> synthesis page 또는 기존 page 수정 제안
  -> Review gate
  -> 승인 시 commit
```

Acceptance criteria:

- 답변 저장도 proposal flow를 따른다.
- Work Vault에서는 기본 Review다.
- Personal Vault에서는 Auto일 수 있으나 예산과 capability를 통과해야 한다.

### 4.5 Dream Sequence

MVP에서는 자동 스케줄보다 수동 실행을 우선한다.

```text
사용자 실행
  -> Vault health check
  -> broken link / orphan / missing source 검사
  -> digest 생성
  -> 변경 제안 생성
```

Acceptance criteria:

- Dream도 직접 main을 고치지 않는다.
- Work Vault에서는 batched review digest로 보인다.

## 5. 화면 범위

### 5.1 Chat 화면

필수 요소:

- Vault selector
- Message list
- Composer
- Provider status
- Current budget indicator
- Pending proposal indicator

필수 액션:

- 자료 추가
- 질문
- save that
- Dream Sequence 실행

### 5.2 Provider Settings 화면

필수 요소:

- Provider list
- `Use Claude Code CLI session`
- `Use Codex ChatGPT session`
- API key fallback
- Connected account label
- Auth mode: delegated 또는 api-key
- Login hint
- Needs reauth state
- Capability matrix
- Remove stored API key
- Test run

### 5.3 Review 화면

필수 요소:

- Proposal title
- Proposal summary
- Base commit
- Changed files
- Diff
- Conflict/stale state

필수 액션:

- Approve
- Reject
- Regenerate

### 5.4 Vault 화면

필수 요소:

- Vault type
- Root path
- Apply mode
- Parallel mode
- Budget cap
- Cache rebuild button

### 5.5 Graph 화면

MVP에서는 화려한 그래프보다 검증 가능한 관계 데이터가 우선이다.

필수 요소:

- Node list
- Edge list
- Page/source filter
- Click to open page

## 6. 데이터 구조

### 6.1 Vault

```text
vault/
  raw/
    session-notes/
    assets/
    pages/
  wiki/
    index.md
    log.md
    processed.md
  .cache/
```

### 6.2 Page frontmatter

```yaml
---
type: topic | entity | synthesis | source-summary
title: string
tags: []
sources: []
created: YYYY-MM-DD
updated: YYYY-MM-DD
vault: work | personal | custom
---
```

### 6.3 Provider credential metadata

API key secret value는 secure store에 있고, 파일이나 client에는 저장하지 않는다. Delegated auth 세션은 Provider CLI가 소유한다.

```yaml
providerId: claude-code | codex
authMode: delegated | api-key
accountLabel: string
connectedAt: ISO-8601
needsReauth: boolean
capabilitiesHash: string
loginHint: string | null
```

### 6.4 Source registry

`wiki/processed.md`는 최소한 다음 정보를 담는다.

- source-id
- raw path
- source type
- ingested at
- status
- generated proposal id

### 6.5 Log

`wiki/log.md` 형식:

```markdown
## [YYYY-MM-DD] ingest - Short title
## [YYYY-MM-DD] query - Short title
## [YYYY-MM-DD] dream - Short title
## [YYYY-MM-DD] session - Short title
```

## 7. 기술 범위

### 7.1 확정 스택

- Desktop: Electron
- Frontend: React
- Core: Node.js/TypeScript
- Validation: Zod
- Storage: Local filesystem + Git
- Credentials: OS credential store
- Auth UX: delegated CLI auth first
- API key: fallback and automation use
- Initial Provider: Claude Code with delegated CLI auth first
- Second Provider Candidate: OpenAI/Codex with delegated ChatGPT sign-in session

Tauri는 성능과 배포 크기 최적화 후보로 남기되, MVP에서는 Node 기반 Headless Core와 Local IPC 연결 속도를 우선해 Electron을 사용한다.

### 7.2 확정 데이터 결정

Proposal:

- 기본 단위: Git branch
- 이름: `proposal/<proposal-id>`
- ID 형식: `prop-YYYYMMDD-HHmmss-shortid`
- base commit 저장 필수

Source:

- ID 형식: `src-YYYYMMDD-HHmmss-shortid`
- URL source는 raw Markdown 파일로 저장한다.
- URL raw 파일은 original URL, fetched timestamp, title, captured text snapshot을 포함한다.
- 원문 snapshot을 얻지 못하면 URL pointer와 실패 사유를 raw로 저장한다.

Graph:

- MVP graph data는 `.cache/graph/graph.json`에 둔다.
- Graph JSON은 rebuild 가능한 파생물이다.
- Node 최소 필드: `id`, `type`, `title`, `path`
- Edge 최소 필드: `from`, `to`, `type`

Credential:

- OS credential store 우선
- 개발 환경에서만 memory fallback 허용
- API key credential value는 UI/client로 반환하지 않는다.
- Claude/ChatGPT 구독 OAuth token은 Mneme가 저장하거나 추출하지 않는다.
- Client는 CLI auth status 확인, login hint 표시, API key 저장/삭제 요청만 수행한다.

## 8. 리스크와 대응

| 리스크 | 대응 |
| --- | --- |
| Provider output이 Wiki를 잘못 수정 | 모든 출력은 proposal로 처리 |
| Vault 간 정보 누수 | 링크/검색/그래프를 Vault 내부로 제한 |
| 승인 대기 중 base 변경 | base commit 검증과 rebase validation |
| 비용 폭증 | per-run, per-vault, global cap |
| Native memory 오염 | Wiki에서 파생된 map만 저장 |
| 그래프와 Wiki 불일치 | 그래프는 rebuild 가능한 파생물로 유지 |
| 구현이 런타임 구현으로 비대해짐 | 자체 agent runtime 구현 제외 |
| 구독 OAuth token 오용 | CLI delegated auth만 사용하고 Mneme는 token 미보유 |
| delegated session 만료 | Provider status에 재로그인 필요 상태 표시 |

## 9. MVP 완료 조건

MVP는 다음 증거가 있을 때 완료로 본다.

- 새 Vault를 만들 수 있다.
- Claude Code 또는 Codex CLI delegated auth 상태를 확인할 수 있다.
- 미로그인 상태에서 적절한 login hint를 보여줄 수 있다.
- 연결된 계정과 capability를 확인할 수 있다.
- API key fallback credential을 저장하고 삭제할 수 있다.
- URL/text/file raw ingest가 된다.
- raw 원문이 Git commit으로 남는다.
- page proposal이 생성된다.
- Review에서 diff를 보고 approve/reject할 수 있다.
- 승인된 proposal이 Git commit으로 반영된다.
- index/log/processed가 갱신된다.
- 질문에 대해 Vault 내부 지식만으로 출처 포함 답변을 생성한다.
- cache rebuild를 실행해 graph/memory/search 파생물을 다시 만들 수 있다.
- Work/Personal Vault의 기본 정책이 다르게 적용된다.

## 10. 다음 작업 순서

1. PRD/MVP 리뷰
2. delegated auth status check 세부 flow 설계
3. Provider auth ADR 리뷰
4. 화면 wireframe 작성
5. 데이터 스키마 확정
6. 구현 스캐폴드 재시작
