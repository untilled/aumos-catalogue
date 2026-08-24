# Evidence-Gated Allocator

Evidence-Gated Allocator는 XKRX, XNAS, XNYS의 주식·ETF·현금을 다루는 세 long-only Aumos
manager를 한 package에 담는다. `morethanmin/trading-harness`의 개인 데이터나 주문 스택이 아니라 방법론과 검증
루프만 포팅한다. 포트폴리오를 바꾸기 전에 다음을 묻는다.

1. 반증 가능한 thesis, 반대 evidence, benchmark 대안보다 나은 논리가 있는가?
2. 이 판단 lens가 독립 forward evidence를 충분히 쌓아 그 크기를 정당화하는가?

`PORTFOLIO_REVIEW`, `ASSET_REVIEW`, `THESIS_REVIEW`, `EVENT_REVIEW`를 지원하며 manager 실행마다
정확히 하나의 AMP/1 `DecisionProposal`을 낸다. 주문 수량·유형·지정가·승인·체결은 Toss
broker connector와 Aumos Kernel/Planner의 책임이고 이 패키지에는 주문 코드가 없다.

## 세 manager topology

| manager | 책임 |
|---|---|
| `evidence-gated-kr` | XKRX 조사와 Global Brief 한도 안의 KR sleeve BUY/SELL/RESIZE |
| `evidence-gated-us` | XNAS/XNYS 조사와 정책상 SGOV 유동성을 포함한 US sleeve |
| `evidence-gated-global` | KRW/USD sleeve, FX, 전체 현금·concentration과 cross-market REBALANCE |

세 manager는 각자 private memory를 가지며 Evidence/Thesis/Brief/WATCH로 협업한다. Specialist는
다른 시장 예산을 임의로 쓰지 않고 Global 안건을 Brief/WATCH로 남긴다. 긴급 thesis invalidation
exit은 다음 Global 실행까지 미루지 않는다.

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
아직 catalogue에 없는 OpenDART([#51](https://github.com/untilled/aumos-catalogue/issues/51))가
필요하다. 준비 전까지 KR ETF와 기존 보유종목의 가격·비중
관리는 가능하지만 신규 KR 단일주 fundamental BUY/thesis 승격은 판단 불가 `WAIT`다.

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
| OpenDART | KR ETF·가격/비중 관리 | 신규 KR 단일주 fundamental BUY/승격 |
| CLI web | core/exit/비중 관리 | theme radar·variant view·컨센서스 차이 판단 |

CLI web은 IR·컨센서스·정책·테마의 보조 계층이다. 확인 URL, 접근 시각, 미검증 범위를 남기며
replay 가능한 Evidence를 대신하지 않는다. 실패는 무음 폴백하지 않는다.

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
scheduling 계산은 LLM 산문이 아니라 `bin/evidence-gated-metrics`가 수행한다. 실행 파일은
stdin JSON 하나를 받아 stdout JSON 하나만 내며 filesystem ledger, credential, network, DB,
order에 접근하지 않는다. `MIGRATION.md`에 legacy 실행 파일 65개/helper의 disposition을,
`fixtures/legacy-golden`에 parity 사례를 기록한다.

promotion gate의 cluster bootstrap/walk-forward/FDR, 실체결 비용 outcome과 MFE/MAE, 기계적
trend/DCA/oversold backtest, specialist sleeve 제한, Global 단일 예산 분모, 일정 변경·late-fire·
dedupe도 같은 실행 코드가 맡는다. 시장별 실패가 package 공통 happy path에 가려지지 않도록
fixture는 `kr`, `us`, `global`로 나뉜다.

## Migration과 provenance

개인 authored instance만 한 번 bootstrap할 수 있다. 자산 논지는 Thesis, 공통 결론은 Brief,
살아 있는 조건은 WATCH/plan, 원시 조사는 Evidence, 집계 calibration/failure만 private memory로
옮기고 `migration/schema-version`으로 재실행을 막는다. 공개 패키지는 항상 empty memory에서
시작한다.

원본 commit과 저작권 고지는 `aumos.json`과 `NOTICE.md`에 있다. credential, 계좌/보유 데이터,
`data/*.jsonl`, SQLite, cache, backup, `_workspace`, 개인 thesis, 주문 코드, 과거 성과는 포함하지
않으며 원본 기록을 Aumos Forward Track Record로 주장하지 않는다.

OpenDART는 API key를 query의 `crtfc_key`로만 받지만 현재 공개된 `SourceSpec/1` secret 주입은
header만 지원한다. manager에게 key를 노출하지 않는 query-secret 주입이 Aumos에 생기기 전에는
실행 가능한 source라고 주장하지 않는다. OpenDART 부재, vendor 응답 shape 변화, CLI web의 비정본성, 설치된 runtime/credential이 필요한
실계좌 paper 검증은 현재 한계다. Private memory는 스스로 방법론을 바꾸거나 lens를 승격할 수
없다.
