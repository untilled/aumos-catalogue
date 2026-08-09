# Vendored

Everything in this directory except this file is **generated**. It is copied out of
the Aumos repository by `packages/package-lint/scripts/vendor.ts`, and a test there
fails Aumos's own build the moment the copy differs from its source.

Do not edit it here. A fix made here would pass this repository's CI and be
refused at the merge, which is the exact failure this arrangement exists to
prevent.

| file | source |
|---|---|
| `rules.ts` | `packages/package-lint/src/rules.ts` |
| `read.ts` | `packages/package-lint/src/read.ts` |
| `agent-package-manifest.schema.json` | `packages/aap/schema/` — generated from zod |
| `decision-proposal.schema.json` | `packages/aap/schema/` — generated from zod |
| `main.ts` | written by `vendor.ts`; it is the only glue |

**This lint is not the gate.** It is your fast feedback. The catalogue is
generated in the Aumos repository, and the same rules run there — from source
rather than from this copy — over every submitted package, as part of producing
`registry.json`. A green tick here is what a reviewer starts from, not what
publishes anything.

---

## 벤더링됨

이 디렉토리에서 이 파일을 뺀 전부가 **생성물**이다. Aumos 저장소의
`packages/package-lint/scripts/vendor.ts`가 복사해 온 것이고, 복사본이 원본과 달라지는
순간 저쪽 테스트가 Aumos 자신의 빌드를 깬다.

여기서 고치지 마라. 여기서 한 수정은 이 저장소의 CI를 통과하고 머지에서 거부된다 —
이 구조가 막으려는 실패가 정확히 그것이다.

| 파일 | 출처 |
|---|---|
| `rules.ts` | `packages/package-lint/src/rules.ts` |
| `read.ts` | `packages/package-lint/src/read.ts` |
| `agent-package-manifest.schema.json` | `packages/aap/schema/` — zod에서 생성 |
| `decision-proposal.schema.json` | `packages/aap/schema/` — zod에서 생성 |
| `main.ts` | `vendor.ts`가 쓴다. 유일한 접착 코드 |

**이 린트는 게이트가 아니다.** 당신을 위한 빠른 피드백이다. 카탈로그는 Aumos 저장소에서
생성되고, 같은 규칙이 거기서 — 이 복사본이 아니라 소스에서 — 제출된 모든 패키지에 대해
`registry.json`을 만드는 과정의 일부로 돈다. 여기의 초록 체크는 리뷰어가 출발하는
지점이지, 무언가를 발행하는 것이 아니다.
