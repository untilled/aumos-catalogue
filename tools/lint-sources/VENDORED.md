# Vendored

Everything in this directory is **generated**, this file included — it is written
from a template in `packages/source-spec/scripts/vendor.ts`, which also copies
the rest out of the Aumos repository, and a test there fails Aumos's own build the
moment a copy differs from its source.

Do not edit it here. A fix made here would pass this repository's CI and be
refused at the merge, which is the exact failure this arrangement exists to
prevent.

| file | source |
|---|---|
| `coherence.ts` | `packages/source-spec/src/coherence.ts` |
| `errors.ts` | `packages/source-spec/src/errors.ts` |
| `hosts.ts` | `packages/source-spec/src/hosts.ts` |
| `source-spec.schema.json` | `packages/source-spec/schema/` — generated from zod |
| `main.ts` | written by `vendor.ts`; it is the only glue |

**This lint runs both halves of the real check**, which is more than the
ManagerPackage lint beside it can say. A document is read by a schema — generated
from the same zod source Aumos parses with — and then by `coherence.ts`, which
is the same file Aumos runs. A green tick here means what the merge means.

**One rule stays behind**, and it is named rather than left to be found: a
document may not declare an endpoint on a **broker's** host, because at a broker
the credential that reads is the credential that trades. That check reads Aumos's
own connector table, which is not published, so it runs at the merge and at the
install. It cannot publish anything; it can only refuse a submission that tried
to relay a broker.

---

## 벤더링됨

이 디렉토리에서 이 파일을 뺀 전부가 **생성물**이다. Aumos 저장소의
`packages/source-spec/scripts/vendor.ts`가 복사해 온 것이고, 복사본이 원본과
달라지는 순간 저쪽 테스트가 Aumos 자신의 빌드를 깬다.

여기서 고치지 마라. 여기서 한 수정은 이 저장소의 CI를 통과하고 머지에서 거부된다 —
이 구조가 막으려는 실패가 정확히 그것이다.

| 파일 | 출처 |
|---|---|
| `coherence.ts` | `packages/source-spec/src/coherence.ts` |
| `errors.ts` | `packages/source-spec/src/errors.ts` |
| `hosts.ts` | `packages/source-spec/src/hosts.ts` |
| `source-spec.schema.json` | `packages/source-spec/schema/` — zod에서 생성 |
| `main.ts` | `vendor.ts`가 쓴다. 유일한 접착 코드 |

**이 린트는 진짜 검사의 두 절반을 다 돈다** — 옆의 ManagerPackage 린트가 못 하는
말이다. 문서는 스키마(Aumos가 파싱하는 것과 같은 zod 소스에서 생성됨)로 한 번,
`coherence.ts`(Aumos가 돌리는 바로 그 파일)로 한 번 읽힌다. 여기의 초록 체크는
머지가 뜻하는 것과 같은 것을 뜻한다.

**규칙 하나는 남는다.** 문서는 **증권사**의 호스트에 엔드포인트를 선언할 수 없다 —
증권사에서는 읽는 자격증명이 곧 거래하는 자격증명이기 때문이다. 그 검사는 발행되지
않는 Aumos의 커넥터 표를 읽으므로 머지와 설치에서 돈다. 무언가를 발행할 수는 없고,
증권사를 중계하려 한 제출을 놀라게 할 수 있을 뿐이다.
