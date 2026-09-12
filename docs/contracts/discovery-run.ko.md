# 발굴 실행 계약

<sub><a href="discovery-run.md">English</a></sub>

`fundamental-mean-reversion`, `catalyst-turnaround`, `shareholder-rerating`은 **종목 하나가
눈앞에 놓인 뒤** 무엇을 재는지는 각자 알고 있다. 그 앞 단계 — 이번 실행이 실제로 어떤 종목을
봤는지, 다음 실행이 어디서 재개하는지, 「후보 없음」이 무슨 뜻인지 — 에 대한 계약은 셋 중 어디에도
없었다. 이 문서가 그 계약이다(#305). 필드 이름 한 벌과 상태 단어 한 벌이며, 세 패키지는 그 뒤의
코드를 각자 벤더링하고 공유하지 않는다.

## 왜 이것이 필요한가

⚠️ **후보 0건과 조회 0건은 같은 출력이고 정반대의 사실이다.** 선언된 유니버스를 훑고 게이트를
통과한 종목이 없었던 실행은 제 일을 했다. 유니버스를 열거하지 못했거나 예산을 보유 검토에 다 쓴
실행은 아무것도 하지 않았다 — 그리고 둘 다 새 이름 하나 없는 `WAIT`으로 끝난다.

이것은 가정이 아니라 실측이다. `evidence-gated`가 바로 그 실패를 실제로 냈다: 한 장부가 여섯 번
깨어나 자기가 찾은 이름을 한 번도 제안하지 않았고(`run_ba37a8f6907a49c3a805a4ce3ee10ec6`, #140),
`coverage`는 **전부 그 장부 자신의 보유 종목으로 이루어진** 분모 위에서
`complete: true, uncovered: []`로 답했다. 거기서의 수정이 이 계약이 통째로 베껴 오는 선례다.

- 아무것도 스크린하지 않았을 때 `complete`는 `false`가 아니라 `null`이다 —
  `managers/evidence-gated/lib/coverage.mjs`.
- 발굴 여력은 **lane** 단위로 세고, 아무도 묻지 않은 lane은 `open`이 아니라 `unstated`다 —
  같은 파일의 `discoveryCapacity`.
- 그 때문에 실행을 막지는 않는다(매도 쪽은 계속 돌아야 한다). 다만 발굴 여력이 0이었는데 그 사실을
  말하지 않는 *제안*은 막는다 — `discovery_lane_dark_undisclosed`.

⛔ **여기 어떤 것도 공용 라이브러리가 아니다.** `COMMONISATION-SURVEY.md`(#270)가 이미 결론을
냈다: 세 패키지의 진짜로 동일한 겹침은 약 열두 줄이고, 공용 모듈로 정책을 합치는 것은 한 패키지의
답이 조용히 이기는 일이다. 공유하는 것은 **어휘** — 필드 이름, 상태 단어, 그리고 각 단어가 무엇을
주장해도 되는지 — 뿐이다.

## 발굴 실행 레코드

세 패키지의 매 실행은 이 이름들로 이것을 기록한다.

```json
{
  "schemaVersion": 1,
  "updatedAtEpochMs": 1772150400000,
  "runId": "run_…",
  "universeDeclared": true,
  "universeSource": "toss:/api/v1/stocks/all",
  "universeCount": 942,
  "symbolsAttempted": 120,
  "symbolsSucceeded": 117,
  "symbolsFailed": ["005930", "068270", "051910"],
  "gatePassed": 9,
  "newCandidates": 2,
  "resumedCandidates": 3,
  "researchCompleted": 1,
  "cursorBefore": { "kind": "symbol-index", "value": "000660", "atEpochMs": 1771891200000 },
  "cursorAfter":  { "kind": "symbol-index", "value": "011070", "atEpochMs": 1772150400000 },
  "priceLaneStatus":  "open",
  "filingLaneStatus": "partial",
  "webLaneStatus":    "unstated",
  "discoveryStatus":  "discovery_incomplete"
}
```

### lane 상태: `open`, `partial`, `dark`, `unstated`

`discoveryCapacity`에서 가져온 네 단어이고, 중요한 것은 네 번째다.

| 상태 | 무엇을 주장하는가 |
|---|---|
| `open` | 시도한 범위 전체에 대해 lane이 조회됐고 답했다 |
| `partial` | 범위의 일부만 답했고 나머지는 실패했거나 도달하지 못했다 |
| `dark` | 조회했으나 쓸 수 있는 것이 오지 않았다 — 연결 불가, 거부, 빈 응답 |
| `unstated` | **아무도 묻지 않았다.** open도 dark도 아니다 |

⚠️ **`unstated`는 약한 `dark`가 아니며, 이것을 `open`으로 기본값 처리하면 #140을 그대로 재현한다.**
실행이 닿지 못한 lane은 던지지 않은 질문이고, 조회하지 않은 lane 셋을 `open`으로 보고하는 실행이
바로 아무것도 읽지 않고 「후보 없음」이라 쓰는 실행이다.

호스트에는 같은 모양의 네 단어가 이미 있고, 우리는 경쟁하는 대신 거기에 매핑한다 —
`source_cache_read.state ∈ never-fetched | refresh-failed | fresh | stale`,
`source_cache_refresh.state ∈ observed | observed-empty | satisfied | failed`. ⛔ 다섯 번째 어휘를
만들려고 `manager-memory`에 두 번째 캐시를 두지 않는다.

### `discoveryStatus`, 그리고 「통과가 없었다」고 말할 수 있는 유일한 길

닫힌 네 값이다. 이 결정표가 계약이다.

| `discoveryStatus` | 필요한 조건 |
|---|---|
| `candidates_produced` | `newCandidates + resumedCandidates > 0` |
| `no_candidate_qualified` | `universeDeclared === true` **이고** 이 전략이 요구하는 모든 lane이 `open` **이고** `symbolsFailed.length === 0` **이고** 후보가 만들어지지 않았다 |
| `discovery_not_run` | 유니버스 미선언, **또는** 발굴 예산을 보유 검토에 소진, **또는** 요구되는 lane이 전부 `dark`/`unstated` |
| `discovery_incomplete` | 유니버스는 선언됐고 일부 범위가 실패했거나 도달하지 못했다 — `symbolsFailed`가 비어 있지 않거나, 요구되는 lane이 `partial` |

⚠️ **두 줄 이상이 동시에 성립할 수 있으므로, 우선순위도 계약의 일부다.**

```text
discovery_not_run > discovery_incomplete > candidates_produced > no_candidate_qualified
```

실패했거나 도달하지 못한 범위가 **만들어진 후보를 이긴다.** 한 이름이 게이트를 통과했는데 같은 스윕의
다른 범위가 실패했다면 그 실행은 `discovery_incomplete`로 보고한다. 이 실행이 시장을 실제로 얼마나
읽었는지는 나중에 읽는 사람이 복원할 수 없는 사실이고, 일부만 처리된 범위는 생산적인 상태에 달린 각주가
아니라 그 자체로 구분되는 상태이기 때문이다. ⚠️ **후보가 사라지거나 감춰지는 것이 아니다.**
`newCandidates` / `resumedCandidates`에 그대로 세어지고, 후보 장부에도 그대로 실리며, 패키지는 자기
진단으로 그 사실을 말할 수 있다. 그 단어에서 따라 나오는 것은 커서다 — 마지막으로 완전히 성공한 범위에
머물러서, 읽지 못한 부분을 건너뛰지 않고 다시 시도한다.

⛔ **넷 중 `no_candidate_qualified`만이 시장에 대한 주장이다.** 나머지 셋은 실행에 대한 주장이다.
나머지가 성립하는데 첫 번째를 보고하는 것이 이 계약이 거부하려는 결함 그 자체다.

`discovery_not_run`은 `DecisionProposal`까지 살아서 건너가야 하는데, 제안에는 diagnostics 필드가
없다(모르는 키가 있으면 호스트가 판단 전체를 버린다). 그래서 **토큰**으로 옮긴다: `rationale.uncertainty`
한 항목에 `discovery_not_run` 문자열을 그대로 싣고, 문장이 아니라 토큰으로 매칭한다 — 그 주변 산문은
invocation의 `language`로 쓰이기 때문이다. `discovery_lane_dark_undisclosed`의 기법을 새로 만들지
않고 그대로 재사용한 것이다.

⚠️ **유니버스 미선언은 `unevaluated`이지 절대 `blocked`가 아니다.** 유니버스가 선언되지 않은 장부야말로
매도 쪽에서 계속 감시해야 하는 장부다. 발굴 0은 보고이지 정지가 아니다.

### 커서 규칙

```text
cursorAfter === cursorBefore
  whenever discoveryStatus ∉ { candidates_produced, no_candidate_qualified }
```

전진한 실행 안에서도: **실패한 범위 너머로는 절대 가지 않는다.** 커서는 마지막으로 *완전히 성공한*
범위를 가리키고, 그래야 다음 실행이 건너뛰는 대신 그 실패를 다시 시도한다. 실패한 페이지를 넘어간
커서는 일시적 벤더 오류를 영구히 읽히지 않는 시장의 한 조각으로, 조용히, 단 한 번에 바꿔 놓는다.

### 패키지별 요구 lane

`optional`인 lane은 `unstated`여도 상태가 바뀌지 않는다. `required`인 lane은 그럴 수 없다.

| 패키지 | 가격 | 공시 | 웹 | 커서 종류 | 커서 값 |
|---|---|---|---|---|---|
| `fundamental-mean-reversion` | required | required | optional | `symbol-index` | 마지막으로 훑은 종목 |
| `catalyst-turnaround` | optional | required | required | `dart-receipt` | `rcept_no` |
| `shareholder-rerating` | optional | required | required | `dart-receipt` | `rcept_no` |

## 후보 장부

패키지마다 문서 하나, 그 패키지 자신의 사설 메모리에 둔다. `strategy`만 다르고 나머지 이름은 전부
같다.

```json
{
  "schemaVersion": 1,
  "strategy": "fundamental-mean-reversion",
  "ruleVersion": "fmr-gate-1",
  "updatedAtEpochMs": 1772150400000,
  "cursor": { "kind": "symbol-index", "value": "011070", "atEpochMs": 1772150400000 },
  "failedRanges": [{ "kind": "symbol-index", "from": "005930", "to": "005935", "reasonCode": "lane_query_failed", "firstFailedAtEpochMs": 1771891200000, "attempts": 2 }],
  "candidates": [
    {
      "symbol": "011070",
      "market": "XKRX",
      "state": "researching",
      "discoveredAtEpochMs": 1771891200000,
      "lastSeenAtEpochMs": 1772150400000,
      "discoveryPath": ["price-sweep"],
      "ruleVersion": "fmr-gate-1",
      "hypothesis": "2024년 일회성 손상차손이 영업 훼손으로 오독됐고 3분기 수주잔고가 그것을 반증한다.",
      "sectionsComplete": ["fall-decomposition"],
      "openQuestions": ["개선된 단가가 3분기 매출에 반영된 시점"],
      "evidenceIds": ["ev_…"],
      "nextReviewAtEpochMs": 1772755200000,
      "nextReviewCondition": "3분기 보고서 접수",
      "excludedReasonCode": null,
      "history": [{ "atEpochMs": 1771891200000, "from": null, "to": "discovered", "ruleVersion": "fmr-gate-1" }]
    }
  ]
}
```

```text
discovered → triaged → researching → watching | proposed | excluded
```

⚠️ **읽히지 않은 불리언은 `false`가 아니라 `null`이다.** `false`는 「보았고 답은 아니오였다」는 뜻이다.
한 층 아래로 내려온 `complete: null`과 같은 구분이다.

### 남이 쓴 장부를 읽을 때

`managers/evidence-gated/lib/research-state.mjs`에서 옮겨 왔고, 각 행이 왜 거부가 아니라 degrade인지
까지 함께 옮겼다. 경계는 *이 연산 자신의 장부 관리*(degrade)와 *정확성*(거부) 사이에 있다.

| 무엇을 읽었나 | 답 | 이유 |
|---|---|---|
| `previous === undefined` | **`data_missing`** — 후보 생성·전진 없음, 커서 불변 | 아무도 키를 읽지 않았다. 그것은 빈 장부가 아니며, 빈 장부로 취급하면 진짜 장부 위에 새 장부를 덮어쓴다 |
| `previous === null` | 빈 장부로 **seed** | 읽었고 진짜로 비어 있다. ⛔ 그래서 이 키는 절대 자기 자신을 잠그지 못한다: 잘못된 쓰기는 언제나 복구 가능하다 |
| `schemaVersion` 없음 | 빈 장부로 **degrade** | 계약 이전에 손으로 쓰인 값에는 그것이 없다. `candidates`가 없으니 잘못 옮길 것도 없다 |
| `schemaVersion` 있고 모르는 값 | **거부** | 이 코드가 모르는 writer다. 그 행은 이 코드가 오독하거나 조용히 버릴 모양일 수 있고, 이력을 버리는 것이 이 파일이 막으려는 실패다 |
| `updatedAtEpochMs > asOf` | **거부** | 나중 실행이 쓴 장부는 과거 시점 행만 담고도 그 실행의 판단을 뒤로 흘릴 수 있다. 키를 잠그지도 못한다 — 이 연산은 `updatedAtEpochMs: asOf`를 쓴다 |
| 파싱 불가 | **degrade** | 이력을 덜 나르지, 틀린 이력을 나르지는 않는다 |
| 모르는 형제 키 | `previousExtraKeys`에 **이름만 보고**하고 절대 옮기지 않는다 | 용량 상한은 `candidates`를 잰다. 임의의 호출자 필드를 옮기는 것은 그 상한에도, 이 키가 소스 캐시가 아니라 명부라는 규칙에도 구멍이다 |

⛔ **blocking diagnostic이 하나라도 뜨면 `nextLedger`는 `null`이다.** 기록된 장부 옆에 붙은 diagnostic은
이름만 다른 거부이면서 이미 써 버린 거부다.

### 상한

| | 상한 |
|---|---|
| 후보 수 | ≤ 200 |
| 직렬화 문서 | ≤ 60 KB |
| 후보당 `evidenceIds` | ≤ 8 |
| `hypothesis` | ≤ 280자 |
| `symbol` | ≤ 32자 |

상한에 걸리는 것은 제외하거나 오래된 것을 떨구라는 신호이지, 상한을 늘리라는 신호가 아니다.

### 여기에 절대 쓰면 안 되는 것

`manager-memory`는 소스 캐시도 계좌 DB도 아니다. 호스트가 그렇게 말하고 있고, 아래가 검사 가능한
목록이며, 걸리면 blocking diagnostic `memory_holds_vendor_payload`다.

| 금지 | 매 실행 어디서 다시 읽는가 |
|---|---|
| `open` / `high` / `low` / `close` / `volume`, `bars`, `rows`, 모든 수치 가격 배열 | Toss `connection_request` — `/api/v1/candles`, `nextBefore`로 페이징 |
| 공시 전문, `excerpt`, 보고서 본문 | **호스트 소스 캐시**를 통한 OpenDART(`source_cache_read` / `source_cache_refresh`) |
| `quantity`, `weight`, `cash`, `averageCost`, `targetWeight` | `portfolio_get` |
| `pending`, 제안 | `portfolio_get` |

⚠️ **대신 남기는 것은 포인터와 질문이다:** 종목, 상태, 한 문장의 가설, 호스트가 발급한 `evidenceId`,
그리고 다음 재검토 때 무엇이 참이어야 하는지. 출처가 있는 것은 전부 그 출처에서 다시 읽는다.

### 두 번 만들어서는 안 되는 재실행 네 가지

| 경우 | 요구되는 동작 |
|---|---|
| **실패 후 재실행** | 범위가 완전히 성공하지 않았다면 `cursor` 불변, `failedRanges`를 새 작업보다 먼저 재시도, `attempts` 증가, 레코드는 늘어나기만 한다 |
| **중복 발견** | 키는 `(market, symbol)`. `lastSeenAtEpochMs` 갱신, `history` 추가, `discoveryPath`는 집합으로 접힌다. 두 번째 행도, 두 번째 제안도 없다 |
| **규칙 버전 변경** | `candidate.ruleVersion !== ruleVersion`이면 `requiresReevaluation: true`와 두 버전을 함께 부르는 diagnostic `rule_version_changed`로 돌려준다. ⛔ 자동 마이그레이션 금지 — 바뀐 게이트는 다시 내릴 판단이지 고쳐 쓸 필드가 아니다 |
| **제외 후보 재진입** | 새 `evidenceIds`와 `reentryReason`을 실은 명시적 전이가 필요하다. `excluded`를 조용히 떨구면 `candidate_state_regressed`, blocked |

`evidenceIds`는 단조 증가하고 — 후보가 이미 가진 것을 잃을 수 없다 — `history`는 추가만 된다.

## 그 아래의 호스트

2026-09-12에 돌아가는 호스트를 상대로 실측한 것이지 가정이 아니다. 호스트가 못 하는 것은 흉내 내는
대신 못 한다고 적는다.

### `manager-memory`는 파일 도구 여섯 개와 해시 하나다

옛 `memory_read` / `memory_write`는 사라졌다. 있는 것은 이것이다.

```text
manager-memory:read   files_list, files_read
manager-memory:write  files_mkdir, files_move, files_remove, files_write
```

경로는 상대 경로이고 `/` 구분이며, 루트는 **매니저 인스턴스**별이다. 이 계약은 `state/<key>.json`에
쓴다. 버전 관리는 없다. 동시성은 `expectedHash` compare-and-swap이고(sha256 hex, `null`은 「아무것도
없었다」), 불일치는 `revision-conflict`, 동시 writer는 `file-lease-held`다 — 재시도한다.

⛔ **여러 파일에 걸친 원자적 쓰기가 없다.** 문서 모양은 그것이 정한다: 커서는 장부 문서 옆이 아니라
**안에** 산다. 파일이 둘이면, 두 쓰기 사이에서 죽은 실행이 후보 목록에 없는 스윕을 주장하는 커서를
남긴다.

⚠️ **시각은 `…EpochMs` 접미사를 단 epoch-ms 숫자이고, 이것은 취향이 아니다.** 게이트웨이는 응답에서
`asOf` 이후의 타임스탬프를 스캔하고, 걸리면 **읽기 전체를** 거부한다. 저장된 문서 안의 문자열 시각은
자기 자신을 읽을 수 없게 만들 수 있는 문서다. 숫자는 이 코드가 `asOf`와, 의도적으로, 직접 비교한다.

### 웹 읽기 → `observation_file` → `evidenceId`

웹은 기록의 출처가 아니고 혼자서 어떤 건도 닫지 않는다. 왕복은 이렇다.

```text
read the source  →  observation_file { url, title, excerpt, publishedAt?, reading?, subject?, asOf }
                 →  evidenceId  →  candidate.evidenceIds[]  →  DecisionProposal.evidenceIds[]
```

`excerpt`는 원문 자신의 말 그대로이고 64000자 이하다 — 넘으면 잘리는 것이 아니라 거부다 — 그리고
`reading`(≤ 2000)이 매니저 자신의 해석을 그렇게 표시해서 담는 자리다. `publishedAt`이 `asOf`보다
뒤면 `post-as-of-timestamp` 거부다. 검색 결과의 제목이나 요약은 excerpt가 아니고 후보를 만들지 못한다.

⚠️ **실행 N에서 기록한 증거는 실행 N+1에서 인용할 수 있고, 실행 N에서는 못 한다.** 끝나지 않은
실행 중에 기록된 증거는 실행이 끝나기 전까지 Kernel에 커밋되지 않는다(JSONL replay). 그래서 장부가
`evidenceId`를 실행 경계 너머로 나르고, 그것을 인용하는 제안은 *다음* 실행의 것이다 — 후보의
`evidenceIds`가 실행 안의 지역 변수가 아니라 이월되는 필드인 이유가 그것이다.

## 실행 순서와 예산

정기 실행은 매번 이 순서를 지킨다.

1. `invocation_read`, `portfolio_get`, 보유 thesis, 자기 후보 장부.
2. 보유 포지션과 기한이 도래한 watch.
3. 이전 실행의 미완료 조사와 `failedRanges`.
4. 마지막으로 성공한 커서 이후의 증분 수집.
5. 선언된 유니버스를 이 전략 자신의 게이트에 통과 → shortlist.
6. 제한된 수의 후보를 **끝까지** 조사하고, 나머지는 다음 질문과 재검토 조건과 함께 저장.
7. 재실행이 안전하도록 장부와 커서를 기록.

초기 운영값, 실행 비용을 잰 뒤 설정으로 좁힌다: **실행당 전략별 기초 조사 최대 3종, 완결 조사 최소 1종.**

⛔ **여러 이름을 얕게 읽고 끝내는 것은 금지다.** 로그에서는 생산적으로 보이면서 아무 판단도 내지 않는
행동이고, 하한을 총량이 아니라 완결 건수로 적는 이유가 그것이다.

⚠️ **보유 검토가 발굴 예산을 소진했다면 답은 `discovery_not_run`이다.** 「신규 후보 없음」이 아니다.
그 실행은 보지 않았다.

## 이 계약이 정하지 않는 것

⛔ 아래는 전부 #256에 따라 각 패키지의 것이고, 그중 무엇에 대한 패키지 간 단언도 뒷문으로 들어오는
정책 공용화다.

- **순위** — shortlist가 어떤 순서인가. (FMR의 것은 명시적으로 낙폭 깊이가 *아니다*.)
- **임계값** — 게이트 수준, 노후화 창, 집행 속도 하한.
- **사이징** — 서로 다른 세 공식이고, 어떤 비중도 다른 패키지의 비중과 비교되지 않는다.
- **청산 로직, 단계 계획, 재arm** — 진실의 출처가 셋이다.
- **severity 단어와 diagnostic 코드** — 각 패키지 자신의 어휘다. 셋은 severity를 같은 말로 쓰지 않고,
  같게 만들지도 않는다.

## 호스트 공백

의존성 목록이며, 아래 어떤 것도 패키지에서 흉내 내지 않기 위해 적는다.

| | 공백 | 그에 대해 **하지 않는** 것 |
|---|---|---|
| H-1 | 시점 고정 XKRX 유니버스가 없다. `/api/v1/stocks/all`이 유일한 전체 시장 경로인데 허용 필터 값이 미측정이고, 목록은 오늘자라서 생존 편향을 안는다 | 유니버스 파일을 지어내지 않고 LLM이 기억한 종목 목록도 쓰지 않는다. `universeDeclared: false`를 쓰고 실행은 `discovery_not_run`으로 보고한다 |
| H-2 | 완료봉 300개 이상. `market_bars`는 250에서 막히고 `prices/daily`는 400일치로 약 270세션이다. 300에 닿는 길은 매니저가 직접 페이징하는 `connection_request /api/v1/candles`뿐이며, `nextBefore`를 되돌려 주고 `adjusted`는 항상 명시한다 | 짧은 시리즈를 채워 넣지 않고 두 조정 기준을 섞지 않는다 |
| H-3 | 소스 캐시 권한이 이 세 패키지에 실제로 주어지는지 미확인 | 우회로 `manager-memory`에 두 번째 캐시를 만들지 않는다 |
| H-4 | 관측 → `evidenceId` 왕복이 두 실행에 걸친다 | Kernel이 커밋하지 않은 증거를 같은 실행에서 인용하지 않는다 |
| H-5 | `start-run`에 종목 subject가 없고 수동 실행은 항상 `PORTFOLIO_REVIEW`다 | `ASSET_REVIEW`인 척하지 않는다. subject에 닿는 유일한 손잡이는 mandate의 자유 문구다 |
| H-6 | 여러 파일 원자적 쓰기가 없다 | 단일 문서 장부, 커서는 그 안에 |
| H-7 | 조정 기준, 거래 정지 상태, 기업행동, 거래대금, 달력 모양이 미측정이다. 캔들은 주식 수 기준 거래량만 싣고 기업행동은 아예 없다 | FMR은 기준을 가정하는 대신 `adjustment_basis_undeclared`로 거부한다. 거래대금을 거래량 × 가격으로 유도하지 않는다 |
| H-8 | 한 펀드의 두 매니저가 같은 이름을 발견할 수 있다 | 여기서는 매니저 간 중복을 제거하지 않는다. 그 경계는 #268이고, 같은 종목도 세 전략 아래에서는 세 개의 다른 가설이다 |

## 어디서 강제되는가

| 검사 | 무엇을 붙잡는가 |
|---|---|
| `npm run check:fundamental-mean-reversion` | FMR의 발굴 레코드·장부·fixture |
| `npm run check:catalyst-turnaround` | CT의 그것들, 그리고 catalyst register 외래키 |
| `npm run check:shareholder-rerating` | SR의 그것들, 그리고 환원 프로그램 연결 |
| `npm run check:discovery-contract` → `tools/verify-discovery-contract.mjs` | 세 패키지를 **가로질러** 필드 이름과 상태 단어: 셋이 레코드를 똑같이 쓰는지, 닫힌 `discoveryStatus` 집합이 닫혀 있는지, 어떤 장부 fixture에도 금지된 페이로드가 없는지 |
| `npm run check:docs` | 이 페이지와 번역본의 섹션 구조가 같은지 |

⚠️ **`tools/shared-scenarios/`는 이것을 담을 수 없다.** 그 스위트는 동작을 단언하고 **필드 이름은
의도적으로 단언하지 않는다** — 그런데 이 계약이 정확히 그 필드 이름이다. 둘은 상보적이고, 그 경계는
양쪽 문서에 모두 적혀 있다.
