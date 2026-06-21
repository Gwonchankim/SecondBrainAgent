---
title: Mneme PRD
version: 0.3
status: planning-baseline
updated: 2026-06-21
language: ko
---

# Mneme 제품 요구사항 문서

## 1. 프로젝트 개요

### 1.1 중심 문장

Mneme는 특정 agent runtime을 확장한 앱이 아니라, 여러 agent runtime을 실행기로 사용하는 **host-owned self-improving knowledge orchestrator**다.

Claude Code, Codex, Hermes, Antigravity 같은 런타임은 교체 가능한 Provider다. 자기개선 루프, 지식 정책, 검수 게이트, 예산 정책, 병렬 정책, 장기 지식 구조는 Headless Core가 소유한다.

### 1.2 만들려는 것

사용자가 제공하는 URL, 텍스트, 파일, 대화 내용을 장기 지식으로 축적하고, 질문과 작업을 반복할수록 더 정교해지는 개인/업무용 지식 에이전트를 만든다.

지식은 Git-backed Markdown Wiki와 raw 원문으로 저장한다. 그래프, 검색 인덱스, native memory map은 모두 이 원본에서 재생성 가능한 파생물로 둔다.

### 1.3 목표

- 사용자가 자료를 넣으면 원문은 보존되고 핵심 지식은 Wiki 변경안으로 제안된다.
- 사용자가 질문하면 저장된 지식과 출처를 근거로 답한다.
- 가치 있는 답변과 Dream Sequence 결과는 다시 Wiki 변경안으로 제안된다.
- 개인 지식과 업무 지식은 Vault 단위로 격리된다.
- Claude 또는 ChatGPT 계정 로그인은 Provider CLI에 위임하고, Mneme는 해당 CLI의 로그인 상태를 확인해 Provider로 사용할 수 있다.
- Provider가 바뀌어도 같은 지식 구조, 검수 정책, 비용 정책이 유지된다.

### 1.4 문제 정의

일반적인 RAG나 파일 업로드형 챗봇은 질문할 때마다 지식을 다시 검색하고 조합한다. 결과가 좋아도 다음 질문의 영속적인 지식 구조로 남지 않는다.

반대로 수동 Wiki는 유지보수 비용이 높아 시간이 지나면 낡거나 흩어진다. Mneme는 원문을 보존하고, 구조화된 Markdown Wiki를 지속적으로 갱신하며, 그 Wiki를 다음 사고의 기반으로 쓰는 방식을 목표로 한다.

### 1.5 대상 사용자

- 개인 연구자: 논문, 기사, 책, 메모를 장기적으로 정리하고 싶은 사용자
- 창업자/기획자: 시장 조사, 고객 인터뷰, 경쟁사 분석을 누적하고 싶은 사용자
- 개발자/업무 사용자: 프로젝트 문서, 회의록, 의사결정을 연결된 지식으로 관리하고 싶은 사용자
- 콘텐츠 제작자: 자료 수집, 주제별 정리, 리서치 브리핑을 반복하는 사용자

## 2. 확정 원칙

### 2.1 제품 정체성

1. Headless Core가 자기개선 루프를 소유한다.
2. Provider Adapter는 작업 실행기일 뿐이다.
3. Provider 출력은 진실이 아니라 변경 제안이다.
4. Hermes도 Adapter 모드에서는 자체 memory, skill generation, cron, nudge, self-improvement loop를 비활성화한다.
5. `AgentProvider` 계약에는 `improveSelf()`, `writeMemory()`, `createSkill()`, `scheduleNudge()` 같은 host-owned 기능이 들어갈 수 없다.

### 2.2 데이터 불변식

1. Git에 담긴 Markdown Wiki와 raw 원문만이 유일한 영속 지식 진실원천이다.
2. Native memory map, graph index, search index는 모두 재생성 가능한 파생물이다.
3. `.cache` 또는 파생 캐시 폴더는 삭제해도 rebuild로 복구되어야 한다.
4. Provider credential, API key, Vault policy는 지식이 아니라 운영 설정이다. 구독 OAuth 세션은 Provider CLI가 소유하고, Mneme는 토큰을 보유하거나 추출하지 않는다.

### 2.3 Vault 격리

1. Vault는 프라이버시, 링크 해석, 그래프, 검색, native memory map, 예산, 검수 정책의 하드 경계다.
2. `[[wikilink]]`는 Obsidian 호환을 위해 파일명 기반으로 유지하되 Vault 내부에서만 resolve한다.
3. 개인 Vault와 업무 Vault는 지식, 그래프, 검색, 예산을 공유하지 않는다.

### 2.4 Provider 인증

Mneme의 인증 모델은 두 트랙으로 나눈다.

1. `delegated`: Claude Code/Codex 같은 Provider CLI가 OAuth/account session을 소유한다. Mneme는 토큰을 보거나 저장하지 않고 CLI 로그인 상태만 확인한다.
2. `api-key`: Headless Core가 OS credential store에 API key를 저장하고, Provider 실행 시 필요한 범위에서만 주입한다.
3. Claude 구독 계정 연결은 Claude Code CLI의 로그인 세션에 위임한다.
4. ChatGPT 계정 연결은 Codex CLI의 ChatGPT sign-in 세션에 위임한다.
5. API key는 fallback, CI, automation, 또는 Provider CLI delegated auth를 사용할 수 없는 환경용으로 지원한다.
6. Client는 provider secret을 보거나 저장하지 않는다.
7. Provider Adapter는 `authStatus`, `authMode`, `accountLabel`, `capabilities`, `loginHint`, `needsReauth` 같은 안전한 메타데이터만 반환한다.
8. Mneme가 구독 OAuth token을 CLI 밖으로 추출해 직접 API 호출에 사용하거나, 다른 사용자의 요청을 개인 구독 세션으로 라우팅하는 것은 금지한다.

### 2.5 검수와 동시성

1. Raw 원문 저장은 불변 입력이므로 즉시 커밋할 수 있다.
2. Raw 원문을 바탕으로 한 `raw/pages/` 통합, 요약, 병합, 수정은 제안으로 생성한다.
3. 제안은 base commit에 대한 Git branch 또는 patch로 저장한다.
4. 승인 시 base가 그대로면 merge한다.
5. base가 이동했으면 re-validate한다. clean rebase면 merge하고, 충돌이면 reject-and-regenerate한다.
6. Dream Sequence 출력도 Provider 출력과 동일하게 제안이며 Vault 기본 정책을 따른다.

### 2.6 정책 토글

병렬 모드:

- `Off`: 서브에이전트 사용 안 함
- `Ask`: 병렬화가 유리하면 사용자에게 확인
- `Auto`: 예산과 권한 안에서 자동 병렬화

반영 모드:

- `Draft`: 변경안만 생성
- `Review`: diff 검수 후 승인 시 반영
- `Auto`: 자동 반영 후 Git commit

강등 규칙:

1. Provider capability 미지원이면 더 안전한 모드로 강등한다.
2. 예산 초과 시 Auto 병렬은 Ask로 강등한다.
3. Vault 기본값보다 더 위험한 방향으로 자동 승격하지 않는다.

### 2.7 예산 모델

- per-run cap
- per-vault daily cap
- per-vault monthly cap
- global monthly hard cap

업무 Vault와 개인 Vault는 비용을 분리한다.

## 3. 사용자 시나리오

### 3.1 Provider 연결

1. 사용자가 Provider Settings를 연다.
2. `Use Claude Code CLI session` 또는 `Use Codex ChatGPT session`을 선택한다.
3. Headless Core가 Provider Adapter에 로그인 상태 확인을 요청한다.
4. 미로그인 상태이면 UI는 `claude` 또는 `codex login` 같은 provider-owned login hint를 보여준다.
5. 사용자는 Provider CLI에서 로그인한다.
6. Mneme는 다시 상태를 확인하고 account label, auth mode, capability matrix를 표시한다.
7. API key mode를 선택한 경우에만 Headless Core가 OS credential store에 key를 저장한다.
8. 사용자는 필요하면 CLI logout 안내 또는 Mneme 저장 API key 삭제를 수행한다.

### 3.2 자료 추가

1. 사용자가 Work Vault를 선택한다.
2. URL, 텍스트, 로컬 파일 중 하나를 입력하고 "add this"라고 요청한다.
3. 시스템은 raw 원문을 변경 없이 저장한다.
4. 시스템은 연결된 Provider를 사용해 핵심 개념, 주장, 출처, 연결 후보를 추출한다.
5. Work Vault 기본 정책에 따라 Wiki 변경안을 review 상태로 보여준다.
6. 사용자가 승인하면 변경안이 Git commit으로 반영된다.
7. index, log, processed, graph, native memory map이 갱신된다.

### 3.3 질문

1. 사용자가 "what do I know about X?"라고 묻는다.
2. Headless Core가 현재 Vault의 native memory map과 index를 사용해 관련 페이지를 찾는다.
3. 필요한 `raw/pages/` 문서를 읽고 출처와 함께 답한다.
4. 답변이 가치 있으면 사용자가 "save that"을 요청한다.
5. 답변은 새 synthesis page 또는 기존 페이지 수정 제안으로 생성된다.

### 3.4 Dream Sequence

1. 사용자가 수동으로 실행하거나 일정에 따라 Dream Sequence가 시작된다.
2. 새 raw 원문, 중복 페이지, 모순, 오래된 주장, 고립 페이지, 링크 누락을 점검한다.
3. 업무 Vault에서는 batched review digest로 묶어서 제안한다.
4. 개인 Vault에서는 정책에 따라 Auto 반영할 수 있다.

## 4. 핵심 기능 목록

### 4.1 Must-have

- Vault 생성과 선택
- Provider delegated auth 상태 확인
- Claude Code CLI delegated auth Provider
- OpenAI/Codex ChatGPT sign-in delegated auth 준비
- API key fallback
- Provider auth status, auth mode, account label, login hint
- URL, 텍스트, 로컬 파일 입력
- raw 원문 저장
- Markdown page frontmatter 검증
- Wiki page 제안 생성
- Git proposal branch 또는 patch 기반 approval flow
- index/log/processed 관리
- Vault 내부 wikilink resolve
- 기본 질의응답
- 출처 포함 답변
- `save that` write-back 제안
- Graph view용 파생 index 생성
- Native memory map 파생 생성
- Provider Adapter thin contract
- 병렬/반영/예산 정책의 최소 동작

### 4.2 Nice-to-have

- 다중 Provider UI
- Hermes Adapter
- Antigravity remote worker
- Telegram/Web client
- BM25 또는 embedding 검색
- 이미지, 음성, PDF 고급 전처리
- 자동 스킬 생성
- 고급 Dream Sequence 리포트
- Obsidian plugin 또는 deep link

### 4.3 제외할 기능

MVP에서는 다음을 만들지 않는다.

- 자체 agent runtime 전체 구현
- Provider별 고급 에이전트 팀 관리
- 원격 접속용 public API
- 클라우드 동기화
- 협업 권한 모델
- 그래프 DB를 원본으로 삼는 기능
- Native memory를 지식 저장소처럼 쓰는 기능
- Client-side provider secret storage

## 5. 기술 스택 방향

### 5.1 제품 구조

```text
Desktop Client
  -> Local IPC
  -> Headless Core
    -> Credential Store (API key mode only)
    -> Wiki + Git
    -> Provider Adapter
    -> Derived indexes
```

### 5.2 Headless Core

역할:

- 자기개선 루프 소유
- Provider CLI delegated auth 상태 확인
- 미로그인 상태의 login hint 제공
- API key mode의 credential 저장과 삭제
- Provider routing
- 정책 강등
- 검수 게이트
- Wiki/Git 조작
- 파생 인덱스 rebuild
- 예산 추적
- 이벤트 스트림 발행

### 5.3 Provider Adapter

역할:

- 인증 방식 선언: delegated, api-key
- 인증 상태 확인
- delegated mode에서 CLI 로그인 상태 조회
- delegated mode에서 provider-owned login hint 반환
- api-key mode에서 key 존재 여부 확인
- 연결 해제
- 작업 실행
- streaming event 반환
- 파일 변경 결과 또는 diff 반환
- 실행 비용과 경고 반환

금지:

- 장기 지식 직접 커밋
- native memory 직접 write
- 자체 nudge scheduling
- 자체 skill 생성
- Host 정책 우회
- provider secret 또는 delegated OAuth token을 client나 Headless Core로 반환하는 것

계약 방향:

```ts
type AuthMode = "delegated" | "api-key";

interface ProviderCapabilities {
  authModes: AuthMode[];
}

interface AuthStatus {
  authenticated: boolean;
  mode?: AuthMode;
  account?: string;
  loginHint?: string;
  message?: string;
}
```

### 5.4 Storage

Vault별 Git repo:

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
    graph-index/
    search-index/
    memory-map/
```

Secret storage:

- API key fallback
- connected account metadata
- credential reference metadata
- delegated CLI auth는 Provider CLI의 자체 저장소에 남긴다.
- Mneme는 Claude/ChatGPT 구독 OAuth token 또는 refresh token을 저장하지 않는다.

`wiki/`는 navigation과 bookkeeping만 담당한다. 실제 지식 페이지는 `raw/pages/`에 둔다.

## 6. 화면 구성

### 6.1 Chat

목적: 사용자가 자료 추가, 질문, 저장, Dream Sequence 실행을 대화로 수행한다.

주요 요소:

- Vault selector
- Provider 상태
- 채팅 메시지
- 출처 패널
- 실행 이벤트
- 승인 대기 변경안 알림

### 6.2 Review

목적: Wiki 변경안을 diff로 검토하고 승인/거부한다.

주요 요소:

- Proposal summary
- Base commit
- Changed files
- Diff viewer
- Rebase/conflict 상태
- Approve, Reject, Regenerate

### 6.3 Graph

목적: 현재 Vault 내부의 지식 관계를 탐색한다.

주요 요소:

- Page, Source, Concept, Entity node
- cites, derived_from, updates, contradicts, related_to edge
- 검색
- node click 시 page preview

### 6.4 Vault Settings

목적: Vault별 정책과 예산을 설정한다.

주요 요소:

- Vault type: work/personal/custom
- Parallel mode
- Apply mode
- Dream mode
- Budget caps
- Provider selection

### 6.5 Provider Settings

목적: Provider 인증과 capability를 확인한다.

주요 요소:

- Provider list
- `Use Claude Code CLI session`
- `Use Codex ChatGPT session`
- API key fallback 입력
- Auth method
- Credential status
- Connected account label
- Login hint
- Needs reauth state
- Remove stored API key
- Capability matrix
- Test run

## 7. 상세 기능 명세

### 7.1 Provider Auth

목적: 사용자가 Provider CLI에 이미 로그인한 Claude 또는 ChatGPT 계정 세션을 Mneme 실행기로 위임 사용하거나, API key mode를 선택한다.

입력:

- Provider ID
- Auth mode: delegated 또는 api-key
- Optional account label

처리:

1. Client가 Provider 연결 상태 확인을 요청한다.
2. Headless Core가 Provider Adapter의 `authenticate()` 또는 `checkAuth()`를 호출한다.
3. delegated mode에서 Adapter는 CLI 로그인 상태를 조회한다.
4. 미로그인 상태이면 Adapter는 `loginHint`를 반환한다.
5. api-key mode에서 Headless Core는 OS credential store의 key 존재 여부를 확인한다.
6. Provider capability와 auth status를 갱신한다.

결과:

- Connected account label
- Auth method
- Login hint 또는 needsReauth
- Capability matrix

예외:

- provider CLI 미설치
- delegated session 미로그인
- delegated session 만료
- workspace 권한 부족
- Provider CLI/session 없음
- API key fallback 필요

### 7.2 Ingest

목적: 사용자가 제공한 자료를 raw 원문과 Wiki 제안으로 분리한다.

입력:

- Vault ID
- Source type: URL, text, file
- Source value
- Optional title/tags

처리:

1. raw 원문을 저장한다.
2. source-id를 생성한다.
3. processed registry에 raw 저장 사실을 기록한다.
4. Provider에 요약/추출 작업을 요청한다.
5. Provider 결과를 Wiki 변경 제안으로 변환한다.
6. Vault 정책에 따라 Draft/Review/Auto로 처리한다.

결과:

- raw source
- proposal
- log entry
- updated derived cache after approval

### 7.3 Query

목적: 저장된 지식을 근거로 답변한다.

입력:

- Vault ID
- Question

처리:

1. native memory map과 index를 사용해 후보 페이지를 찾는다.
2. 관련 pages와 source summary를 읽는다.
3. 답변과 출처를 생성한다.
4. 저장 가치가 있으면 write-back 제안으로 전환할 수 있게 한다.

결과:

- Answer
- Source citations
- Optional proposal

### 7.4 Approval

목적: LLM/Provider/Dream 출력이 바로 진실원천에 들어가지 않게 한다.

입력:

- Proposal ID
- User decision

처리:

1. proposal base commit을 확인한다.
2. main이 그대로면 merge한다.
3. main이 이동했으면 rebase validation을 수행한다.
4. clean이면 merge하고, 충돌이면 regenerate를 요청한다.

결과:

- Commit
- Rejected proposal
- Regenerated proposal

### 7.5 Dream Sequence

목적: 지식 저장소를 주기적으로 정리하고 건강 상태를 개선한다.

검사 항목:

- 새 raw 원문
- 중복 페이지
- 모순
- 오래된 주장
- 고립 페이지
- source 없는 주장
- broken wikilink
- graph gap

결과:

- Review digest
- Proposed changes
- Health report
- Log entry

## 8. 디자인 가이드

- 운영 도구처럼 조용하고 밀도 있게 만든다.
- 첫 화면은 채팅과 현재 Vault 상태를 바로 보여준다.
- Provider Settings에는 delegated CLI session 상태와 API key fallback 상태를 명확히 보여준다.
- 업무 Vault는 검수와 추적을 강조한다.
- 개인 Vault는 빠른 입력과 자동 정리를 강조한다.
- 색상은 teal을 Core/자기개선 계층의 의미색으로 제한적으로 사용한다.
- 위험 액션은 명확히 구분한다: revoke, reject, auto apply, delete cache.
- 키보드 탐색과 screen reader label을 MVP부터 고려한다.

## 9. 제약 사항

- MVP는 로컬 우선이다.
- 원격 client는 Phase 2 이후로 미룬다.
- Provider credential은 client에 노출하지 않는다.
- 구독 OAuth token은 Provider CLI 밖으로 추출하지 않는다.
- API key는 Headless Core와 secure store 밖으로 나가지 않는다.
- raw 원문은 수정하지 않는다.
- 그래프와 검색 인덱스는 원본이 아니다.
- Vault 간 링크/검색/그래프는 기본적으로 금지한다.
- 업무 Vault 기본값은 Review + Ask다.
- 개인 Vault 기본값은 Auto + Auto로 둘 수 있으나 예산 cap을 넘을 수 없다.

## 10. 확정 결정과 미결정 항목

확정된 MVP 기술 결정:

- 첫 Provider는 Claude Code로 시작하되 delegated CLI auth를 기본 UX로 둔다.
- Codex는 두 번째 Provider 후보이며 ChatGPT sign-in 세션을 delegated auth로 사용한다.
- API key는 fallback과 automation용으로 둔다.
- Proposal은 `proposal/<id>` Git branch를 기본 저장 단위로 사용한다.
- Proposal ID는 `prop-YYYYMMDD-HHmmss-shortid` 형식을 사용한다.
- Source ID는 `src-YYYYMMDD-HHmmss-shortid` 형식을 사용한다.
- URL raw 저장은 URL 메타데이터와 당시 수집한 본문 snapshot을 Markdown 파일로 저장한다.
- Credential store는 OS credential store를 우선하고, 개발 환경에서만 명시적 opt-in memory fallback을 허용한다.

미결정 항목:

- page taxonomy 세부 규칙
- PDF/image/audio 전처리 시점
- graph layout library
- 예산 추적 단위의 실제 token/cost 계산 방식

## 11. 참고

- OpenAI Codex authentication: https://developers.openai.com/codex/auth
- OpenAI Codex CLI login reference: https://developers.openai.com/codex/cli/reference
- Claude Code authentication: https://docs.anthropic.com/en/docs/claude-code/iam
