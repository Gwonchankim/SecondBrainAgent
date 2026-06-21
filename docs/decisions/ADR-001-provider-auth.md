# ADR-001: Provider 인증은 delegated CLI auth 우선, API key는 fallback으로 둔다

## Status

Accepted

## Date

2026-06-21

## Context

Mneme는 Claude Code, Codex, Hermes, Antigravity 같은 agent runtime을 교체 가능한 Provider로 사용한다. 사용자는 Claude 또는 ChatGPT 구독 계정으로 로그인한 도구를 활용하고 싶어 한다.

하지만 구독 기반 OAuth/account session은 Provider가 제공하는 CLI 또는 native app 안에서 관리되는 것이 정상 경계다. Mneme가 Claude/ChatGPT OAuth token을 직접 보관하거나 추출해 API 호출에 쓰면, 벤더가 의도한 구독 사용 경계를 벗어날 수 있다.

공식 문서 기준:

- Codex는 ChatGPT sign-in과 API key sign-in을 지원한다. CLI sign-in은 브라우저를 열어 ChatGPT flow를 완료하고, CLI/IDE가 캐시된 로그인 정보를 재사용한다. API key는 usage-based access이며 CI/CD 같은 programmatic workflow에 권장된다.
- Claude Code는 OAuth token과 API key를 모두 사용하지만 목적이 다르다. Anthropic은 third-party product/service가 Free/Pro/Max plan credential을 사용자 대신 라우팅하는 것을 허용하지 않으며, 제품/서비스 개발자는 API key 인증을 사용해야 한다.

## Decision

Mneme의 Provider 인증은 두 트랙으로 명확히 나눈다.

```ts
export type AuthMode =
  | "delegated" // Provider CLI owns OAuth/account session. Mneme never sees tokens.
  | "api-key";  // Mneme stores API key in Core-side CredentialStore.

export interface ProviderCapabilities {
  authModes: AuthMode[];
}

export interface AuthStatus {
  authenticated: boolean;
  mode?: AuthMode;
  account?: string;
  loginHint?: string;
  message?: string;
}
```

1. 사용자용 기본 경로는 `delegated`다.
2. Claude 연결은 `claude` CLI의 로그인 세션을 사용한다.
3. ChatGPT/Codex 연결은 `codex login`으로 생성된 Codex CLI 세션을 사용한다.
4. Mneme는 delegated mode에서 OAuth/access/refresh token을 보거나 저장하지 않는다.
5. Mneme는 delegated mode에서 CLI 로그인 상태만 확인하고, 미로그인 시 `loginHint`를 보여준다.
6. API key mode에서만 Headless Core가 OS credential store에 secret을 저장한다.
7. Client는 provider secret을 직접 보거나 저장하지 않는다.
8. 멀티유저 라우팅, 서버형 대행, CI/CD, automation은 API key 또는 벤더가 허용한 enterprise access token 경로를 사용한다.

## Consequences

- `authenticate()`는 OAuth flow 구현이 아니라 Provider별 로그인 상태 확인으로 설계한다.
- `CredentialStore`는 구독 OAuth token용이 아니라 API key mode용이다.
- Provider Settings 화면은 `Use Claude Code CLI session`, `Use Codex ChatGPT session`, `API key fallback`을 분리해서 보여준다.
- Claude/Codex Adapter는 CLI 실행 가능 여부와 로그인 상태를 검사해야 한다.
- `codex login status`처럼 공식 상태 확인 명령이 있는 경우 이를 사용한다.
- Claude Code는 공식 상태 확인 명령을 실측해 Adapter capability에 반영해야 한다.
- Mneme가 Provider CLI 밖으로 구독 OAuth token을 꺼내 직접 API 호출에 사용하는 것은 금지한다.

## Alternatives Considered

### Mneme가 직접 OAuth client가 된다

- Pros: UX를 완전히 통제할 수 있다.
- Cons: 구독 OAuth token을 third-party host가 보유하게 되어 벤더 정책과 충돌할 수 있다.
- Rejected: 컴플라이언스 경계가 불명확하다.

### API key only

- Pros: 자동화와 서버 실행에 깔끔하다.
- Cons: 사용자가 원하는 Claude/ChatGPT 구독 계정 활용 경험과 맞지 않는다.
- Rejected: 사용자용 로컬 앱 기본 UX로는 약하다.

### Delegated CLI auth only

- Pros: 구독 계정 경계를 가장 잘 지킨다.
- Cons: CI/CD, 서버 automation, 일부 headless 환경에서 어렵다.
- Rejected: API key fallback은 필요하다.

## References

- OpenAI Codex authentication: https://developers.openai.com/codex/auth
- OpenAI Codex CLI login reference: https://developers.openai.com/codex/cli/reference
- OpenAI Codex CI/CD auth guidance: https://developers.openai.com/codex/auth/ci-cd-auth
- Claude Code authentication: https://docs.anthropic.com/en/docs/claude-code/iam
- Claude Code legal and compliance: https://docs.anthropic.com/en/docs/claude-code/legal-and-compliance

