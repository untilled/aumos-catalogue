# Evidence-Gated Allocator — Global

`evidence-gated-global`은 **배분자**다. KRW/USD sleeve 목표와 FX, 전체 concentration을 쥐고,
cross-market `REBALANCE`를 낼 수 있는 유일한 멤버다.

주식·ETF·현금을 다루는 long-only Aumos manager다. `morethanmin/trading-harness`의 개인 데이터나 주문 스택이 아니라 방법론과 검증
루프만 포팅한다. 포트폴리오를 바꾸기 전에 다음을 묻는다.

1. 반증 가능한 thesis, 반대 evidence, benchmark 대안보다 나은 논리가 있는가?
2. 이 판단 lens가 독립 forward evidence를 충분히 쌓아 그 크기를 정당화하는가?

`PORTFOLIO_REVIEW`, `ASSET_REVIEW`, `THESIS_REVIEW`, `EVENT_REVIEW`를 지원하며 실행마다
정확히 하나의 AMP/1 `DecisionProposal`을 낸다. 주문 수량·유형·지정가·승인·체결은 Toss
broker connector와 Aumos Kernel/Planner의 책임이고 이 패키지에는 주문 코드가 없다.

## 이 패키지가 속한 컬렉션

이 패키지는 셋 중 하나이고, 셋은 **Evidence-Gated Allocator** 컬렉션으로 함께 게시된다.

| 패키지 | 책임 |
|---|---|
| `evidence-gated-kr` | XKRX 조사와 Global Brief 한도 안의 KR sleeve BUY/SELL/RESIZE |
| `evidence-gated-us` | XNAS/XNYS 조사와 정책상 SGOV 유동성을 포함한 US sleeve |
| `evidence-gated-global` | KRW/USD sleeve, FX, 전체 현금·concentration과 cross-market REBALANCE |

**패키지 하나가 매니저 하나다.** 각각 따로 설치되고 따로 판정되며 각자의 private memory를 갖는다 —
셋을 다 설치하는 것은 카탈로그의 **제안**이지 한 트랜잭션이 아니어서, 하나가 거절돼도 나머지 둘은
그대로 돈다. 협업은 Evidence·Thesis·Brief·WATCH로 하고, specialist는 다른 시장 예산을 임의로 쓰지
않고 Global 안건을 Brief/WATCH에 남긴다. 긴급 thesis invalidation exit은 다음 Global 실행까지
미루지 않는다.

⚠️ **나머지 둘이 설치돼 있어야 하는 것은 아니다.** 이 패키지는 혼자로도 성립한다: Brief에 Global
sleeve 한도가 없으면 맨데이트와 장부가 말하는 것으로 운용하고, 형제가 돌았다고 가정하지 않는다.

`reserveLiquiditySymbols` 기본값은 빈 배열이며 SGOV도 투자자 config 또는 현재 shared Brief가
명시한 경우에만 reserve liquidity로 계산한다.

## 상태의 정본

| 내용 | 정본 |
|---|---|
| 실시간 포지션·현금·체결 | Portfolio / Toss broker connector |
| 자산별 주장과 무효화 | Thesis |
| 포트폴리오 공통 결론 | Brief |
| vendor 원시 조사 | Evidence |
| 재검토 약속 | WATCH / plan |
| lens 표본·보정·반복 실패 | instance-private manager memory |
| 판단과 실제 성과 | Decision journal / Forward Track Record |
| 영구 규칙 | 승인된 package version / config |

Private memory에는 활성 thesis, raw evidence 본문, Brief 내용, 실행 gate, 주문/체결, stale
source 복사본, 자동 채택 규칙을 넣지 않는다. 같은 book의 다른 manager는 Brief를 읽을 수
있지만 private memory는 읽지 못한다. 별도 instance/model도 서로의 memory를 공유하지 않는다.

## Source와 설치 정책

Toss broker connector와 `toss` market source는 다르다. connector는 계좌와 실행을, source는
가격·캔들·호가·메타데이터 등을 맡는다. US 단일주 lane은 `toss`, `sec-edgar`, `alpaca`가
필요하고 `openbb-fmp`는 장기 가격 이력이 필요할 때만 선택한다. KR 단일주 fundamental lane은
이 패키지와 함께 이 catalogue에 게시된 `open-dart`가 필요하다. 설치되지 않은 기기에서는 KR ETF와
기존 보유종목의 가격·비중 관리는 가능하지만 신규 KR 단일주 fundamental BUY/thesis 승격은 판단 불가
`WAIT`다 — *아무도 갖지 못한 기능*이 아니라 *이 기기가 설치하지 않은 소스*다.

모든 호출에는 invocation의 `asOf`를 그대로 전달하고 이후 row를 폐기한다. SEC는 `filed`,
DART는 접수시각/접수번호, 뉴스·기업행사는 공개 시각, 가격은 bar 시각을 시장 가용 시점으로
쓴다. 항상 현재를 반환하는 snapshot은 replay 정본이 아니다. adjusted/unadjusted series를
섞지 않고 corporate action으로 불연속을 검산한다. 누락·stale·상충은 `uncertainty`에 적으며
모델 지식으로 메우지 않는다.

| 누락 | 계속 가능 | 차단 |
|---|---|---|
| `toss` | 기존 Evidence/Thesis 검토 | 신규 가격 신호·목표 계산 |
| `sec-edgar` | KR/ETF lane | 신규 US fundamental BUY/승격 |
| `alpaca` | SEC/Toss 검토 | 뉴스/기업행사 확인이 필수인 신규 판단 |
| `open-dart` | KR ETF·가격/비중 관리 | 신규 KR 단일주 fundamental BUY/승격 |
| CLI web | core/exit/비중 관리 | theme radar·variant view·컨센서스 차이·정책/매크로 판단 |

매니페스트의 `source:passthrough`가 `toss`·`sec-edgar`·`alpaca`·`open-dart`를 이름으로 댄다. 그래서 설치
화면이 *이 기기에 무엇이 없는지*를 런이 발견하기 전에 말한다. `openbb-fmp`는 선택이라 적지 않았다.
이름을 대는 것이 게이트웨이를 좁히지는 않는다 — 런은 여전히 이 기기의 모든 source를 본다.

OpenDART의 성질 셋은 매니저의 몫이다(Aumos는 읽지 않고 중계한다): `corpCode.xml`은 ZIP으로
답하고(대신 `list.json`의 `corp_code`·`stock_code`를 읽는다), 오류가 200 응답의 `status`로 오며
(한도 초과는 빈 결과가 아니다), XBRL 재무제표는 정기보고서를 따라오므로 잠정실적만 발표된 분기에는
없다 — 잠정 수치로 메우지 않고 공백으로 기록한다.

CLI web은 IR·컨센서스·정책·매크로·테마의 보조 계층이다. 확인 URL, 접근 시각, 미검증 범위를
남기며 replay 가능한 Evidence를 대신하지 않는다. 실패는 무음 폴백하지 않는다.

웹에서 온 숫자는 쓰기 전에 종류와 시각을 갖는다. 컨센서스·회사 guidance·실제 발표는 세 개의
서로 다른 관측으로 남고 각각 metric, 단위와 통화가 붙은 값, 대상 기간, `sourceUrl`,
`publishedAt`, `capturedAt`을 든다. 날짜 없는 검색 snippet은 point-in-time 근거가 아니고,
aggregator끼리 어긋나면 평균하지 않고 충돌로 기록한다. 매크로·정책 관측(VIX, put/call, 심리
지표, breadth, 지수와 이동평균, 중앙은행·산업 정책)은 `observedAt`과 source tier가 있어야 하며,
공식 발행처가 aggregator 재인용을 이긴다. **날짜 없는 관측은 현재값으로 쓰지 않고 거절한다** —
replay가 정직할 수 있는 이유가 그 한 줄이다. 웹 가격은 Toss와 교차검증하고, 설정된 5%를 넘으면
Toss를 택한 뒤 차이를 provenance로 남긴다. macro score는 없다: regime 판단은 한 `asOf`의 Brief
판단이지 이 패키지가 들 수 있는 숫자가 아니다.

## 학습과 검증

평균회귀 과매도 깊이는 확신도가 아니다. 안정화/basing이 별도로 필요하다. 추세 눌림은 얕은
낙폭이 정의이므로 추세 온전성·사업 품질·촉매·active edge로 판정한다. 신규 단일주 BUY는
why-cheap, trap risk, variant view, benchmark alternative, 시나리오와 thesis challenge를 모두
요구한다. 조건 미충족은 기계 판정 가능한 WATCH/plan으로 남긴다.

Memory 값은 고정 key, schema version, `updatedAsOf`, Decision/Evidence id, sample 수, 독립 date
cluster 수, metric, 결측 필드, maturity 상태를 가진 JSON object다. 같은 key 쓰기는 과거 row를
덮지 않고 새 revision을 만든다. replay는 자기 `asOf` 이후 revision을 읽지 않는다. empty 또는
손상 memory는 diagnostics에 남기고 무시한다.

다음 명령은 persistence, revision, replay, instance/model 격리, Brief/memory 경계, audit/Evidence
관측, empty/corrupt memory, 미래 source row, stale/conflict/가격 기준 혼합 fixture를 검증한다.

```sh
node tools/verify-evidence-gated-allocator.mjs
```

이는 결정론적 contract model이다. 배포 전에는 설치된 Aumos와 Toss paper portfolio에서 2회
연속 실행, 별도 instance 격리, broker-connected shadow run도 반복해야 한다.

`IMPLEMENTATION.md`는 이슈 #50의 Phase 0–7 체크리스트를 추적하고 `CONFORMANCE.md`는 이
저장소에서 재현 가능한 검증과 설치 runtime/사용자 연결이 필요한 release gate를 분리한다.
release gate가 남아 있는 동안 package는 publish하지 않는다.

Scanner, sizing, coverage, evidence admission, calibration, attribution, point-in-time parsing과
scheduling 계산은 LLM 산문이나 대화형 Bash 승인이 아니라 package의
`evidence-gated-metrics` MCP server가 수행한다. `bin/evidence-gated-metrics`는 같은 코어를
operator/CI용 stdin JSON → stdout JSON으로 제공한다. 두 인터페이스 모두 filesystem ledger,
credential, network, DB, order에 접근하지 않는다. `MIGRATION.md`에 legacy 실행 파일 65개/helper의 disposition을,
`fixtures/legacy-golden`에 parity 사례를 기록한다.

promotion gate의 cluster bootstrap/walk-forward/FDR, 실체결 비용 outcome과 MFE/MAE, 기계적
trend/DCA/oversold backtest, specialist sleeve 제한, Global 단일 예산 분모, 일정 변경·late-fire·
dedupe도 같은 실행 코드가 맡는다. 시장별 실패가 package 공통 happy path에 가려지지 않도록
fixture는 `kr`, `us`, `global`로 나뉜다.

## 원본 하네스와의 parity

방법론은 옮긴 것이지 다시 쓴 것이 아니다. `tools/legacy-parity.mjs`가 원본 Python 코어와 이
패키지의 결정론 코어를 **같은 synthetic 입력**으로 돌려 필드 단위로 비교한다 — 현재 21개 케이스,
59개 필드. legacy 쪽 숫자는 한 번 측정해서 `fixtures/legacy-golden/parity.json`에 얼려 두므로,
이 저장소에서는 Python도 비공개 체크아웃도 없이 비교가 돈다. 일부러 갈라진 자리는 `MIGRATION.md`가
어느 필드가 어느 방향으로 왜 갈라졌는지 적고, fixture가 **그 차이를 단언한다** — 조용히 되돌아가면
거기서 깨진다.

## Migration과 provenance

개인 authored instance만 한 번 bootstrap할 수 있다. 자산 논지는 Thesis, 공통 결론은 Brief,
살아 있는 조건은 WATCH/plan, 원시 조사는 Evidence, 집계 calibration/failure만 private memory로
옮기고 `migration/schema-version`으로 재실행을 막는다. 공개 패키지는 항상 empty memory에서
시작한다.

원본 commit과 저작권 고지는 `aumos.json`과 `NOTICE.md`에 있다. credential, 계좌/보유 데이터,
`data/*.jsonl`, SQLite, cache, backup, `_workspace`, 개인 thesis, 주문 코드, 과거 성과는 포함하지
않으며 원본 기록을 Aumos Forward Track Record로 주장하지 않는다.

`open-dart`는 이제 이 catalogue에 게시돼 있다. 설치하지 않았거나 API key가 없는 기기는 KR
단일주 fundamental을 판단할 수 없고, 그것이 남은 한계의 정확한 모양이다.

⚠️ **`thesis:read`와 `evidence:read`는 선언돼 있고 현재 Aumos 빌드에서 아무것도 서빙하지
않는다.** 매니페스트 어휘에는 있지만 `grant.ts`가 둘 다 빈 도구 목록으로 매핑하므로 런에
`thesis_read`/`evidence_read` 도구가 생기지 않는다. 프롬프트가 *가능할 때* 읽는다고 적고
매니페스트가 둘을 `optionalSkills`에 두는 이유가 그것이다. Aumos가 서빙하기 전까지 자산 논지는
invocation payload와 Brief로 런에 닿으며, 이 패키지는 하지 못하는 조회를 하는 척하지 않는다.
`RunProvenance.unservedTools`가 그 차이를 기록하는 자리다.

vendor 응답 shape 변화, CLI web의 비정본성, 설치된 runtime/credential이 필요한 실계좌 paper
검증은 현재 한계다. Private memory는 스스로 방법론을 바꾸거나 lens를 승격할 수 없다.
