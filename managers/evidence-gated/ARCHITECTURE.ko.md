# 아키텍처

<sub><a href="ARCHITECTURE.md">English</a></sub>

[README.ko.md](README.ko.md)는 투자자가 읽는 페이지다. 이건 같은 패키지의 엔지니어링 절반이다:
어떤 상태를 누가 소유하는지, 데이터와 설치 계약이 무엇인지, 메모리가 어떻게 도는지, 어떤 스킬이
있는지, 그리고 이식본이 원본에 어떻게 붙들려 있는지.

## 상태의 정본

| 내용 | 정본 | 예 |
|---|---|---|
| 실시간 포지션·현금·체결 | Portfolio / Toss broker connector | 비중과 가용 현금 |
| 자산별 주장 | Thesis | 스탠스와 검증 가능한 무효화 조건 |
| 포트폴리오 공통 결론 | Brief | 국면, 섹터 견해, 신규 진입 보류 |
| vendor 원시 조사 | Evidence | 벤더 가격·공시·뉴스 페이로드 |
| 재검토 약속 | WATCH / plan | 가격·날짜·공시 트리거와 만료 |
| 학습 집계 | 매니저 사설 메모리 | lens 표본, 보정, 반복 실패 |
| 실제 판단과 성과 | Decision journal / Forward Track Record | BUY/WAIT/SELL과 포워드 결과 |
| 영구 규칙 | 패키지 버전 / config | 승인된 문턱값 또는 방법 변경 |

사설 메모리에는 활성 thesis, raw evidence 본문, 공유 Brief 내용, 실행 gate, 주문/체결, 낡은 소스
데이터 사본, 자기 승인 규칙 변경을 절대 넣지 않는다. Brief는 같은 장부의 다른 매니저가 읽을 수
있고, 사설 메모리는 이 패키지 인스턴스/모델로 범위가 한정된다. 다른 인스턴스와 다른 모델은 서로
공유하지 않는다.

## 데이터 아키텍처와 설치 정책

Toss broker connector와 `toss` 소스는 다르다. connector는 계좌 상태와 실행을 소유하고, 소스는
공개 시장 엔드포인트를 중계한다. 완전한 US 단일종목 레인은 `toss`·`sec-edgar`·`alpaca`를 설치한다.
`openbb-fmp`는 선택이고 장기 가격 이력을 보충할 때만 쓴다. 완전한 KR 단일종목 펀더멘털 레인은
이 패키지와 함께 이 카탈로그에 게시된 `open-dart`를 추가로 요구한다. 설치되지 않은 곳에서는 KR
ETF와 기존 보유의 가격/비중 관리는 펀더멘털 불확실성을 진술한 채 돌 수 있지만, 신규 KR 단일종목
펀더멘털 BUY나 thesis 승격은 판단 불가 WAIT다 — 아무도 갖지 못한 기능이 아니라, 이 기계가 소스를
설치하지 않은 것이다.

모든 소스 호출은 invocation의 `asOf`를 받는다. 매니저는 그 이후 row를 폐기하고, 시장 가용성으로
신선도를 잰다: SEC는 `filed`, OpenDART는 접수 시각/번호, 뉴스·기업행위는 공개·공시 시각, 가격은
bar 시각. 항상 현재 상태를 돌려주는 스냅샷은 replay 소스가 아니다. adjusted와 unadjusted 계열을
절대 섞지 않고, 불연속은 기업행위로 설명한다.

| 누락 | 계속 가능 | 차단 |
|---|---|---|
| `toss` market source | 기존 Evidence/Thesis 검토 | 신규 가격 신호와 목표 계산 |
| `sec-edgar` | KR/ETF 레인 | 신규 US 펀더멘털 BUY/승격 |
| `alpaca` news/actions | SEC/Toss 검토 | 뉴스·기업행위 확인이 필요한 신규 판단 |
| `open-dart` | KR ETF와 가격/비중 관리 | 신규 KR 단일종목 펀더멘털 BUY/승격 |
| CLI web | core/exit/비중 관리 | theme radar, variant view, 컨센서스 차이, 정책·매크로 주장 |

매니페스트가 `source:passthrough` 권한에 `toss`·`sec-edgar`·`alpaca`·`open-dart`를 이름으로
댄다. 그래서 설치 화면이 실행이 발견하기 전에 이 기계에 무엇이 없는지 말할 수 있다. `openbb-fmp`는
선택이라 적지 않았다. 소스를 이름 대는 것이 게이트웨이를 좁히지는 않는다 — 실행은 여전히 기계에
설치된 모든 소스를 본다.

OpenDART의 동작 셋은 매니저의 몫이다. Aumos가 읽지 않고 중계하기 때문이다: `corpCode.xml`은
ZIP으로 답하고(대신 `list.json`의 `corp_code`/`stock_code`를 읽는다), 오류가 HTTP 200의 `status`
필드로 도착하며(한도 거절은 빈 결과가 아니다), XBRL 재무제표는 정기보고서를 따라오므로 잠정으로만
발표된 분기에는 제표가 없다 — 기록할 공백이지, 잠정 수치로 메울 공백이 아니다.

CLI web은 IR·컨센서스·정책·매크로·테마 맥락의 보조다. replay 정본 Evidence가 아니다: 실행은 확인한
URL, 접근 시각, 미검증 범위를 기록한다. 실패는 명시적이고 절대 모델 지식으로 조용히 대체되지 않는다.

웹에서 온 수치는 쓰기 전에 종류와 날짜를 갖고, 결정론 코어가 두 계약을 모두 강제한다. 컨센서스,
회사 가이던스, 실제 발표치는 metric, 단위와 통화가 붙은 값, 대상 기간, 소스 URL, 발행 시각, 포착
시각을 지닌 서로 다른 세 관측으로 남는다. 날짜 없는 스니펫은 시점 고정 증거가 아니고, 어긋나는
aggregator는 평균하지 않고 충돌로 기록한다. 매크로·정책 관측 — VIX, put/call, 심리, breadth, 지수
수준과 이동평균, 중앙은행·산업 정책 — 은 관측 시각과 소스 등급이 있어야 하고, 공식 발행처가
aggregator 재인용을 이기며, 날짜 없는 관측은 현재값으로 다루는 대신 거절한다. 웹 가격은 Toss와
교차 검증한다. 기본 5%인 `priceConflictTolerance`를 넘으면 Toss가 선택된 가격이 되고 차이는
provenance로 보관된다. macro score는 없다: 국면 판단은 한 `asOf`의 Brief 판단이지 이 패키지가 들 수
있는 숫자가 아니다.

## 메모리 계약

패키지는 `skills/memory-contract/SKILL.md`에 문서화된 안정적인 키 아홉 개를 쓴다. 값은 스키마
버전, 갱신 시각, 뒷받침하는 Decision/Evidence id, 표본·독립 클러스터 수, 계산 가능한 지표, 결측
필드, maturity 상태를 지닌 JSON 객체다. 쓰기는 키를 재사용하며, 집계가 바뀔 때만 새 revision을
만든다. 과거 replay는 오늘의 head가 아니라 자기 `asOf` 이하의 최신 revision을 읽는다. 비었거나
손상된 메모리는 진단에 남기고 안전하게 무시하므로, 첫 실행도 유효한 WAIT·WATCH·조건부 BUY를
돌려준다.

레퍼런스 계약을 로컬에서 재현하려면:

```sh
node tools/verify-evidence-gated-allocator.mjs
```

픽스처가 증명하는 것: 실행 A → 실행 B 지속성, 같은 키의 append-only revision, 과거 replay,
인스턴스/모델 격리, 공유 Brief와 사설 메모리의 분리, audit/Evidence 관측 가능성, 빈 메모리 동작,
손상 메모리 열화. 미래 row 제거, 신선도, 소스 충돌, adjusted/unadjusted 혼합도 검사한다. 픽스처는
결정론적 계약 모델이다. 릴리스 후보는 설치된 Aumos 런타임과 Toss 연결 페이퍼 포트폴리오를 상대로
같은 케이스를 paper/shadow 실행에서 한 번 더 반복해야 한다.

`IMPLEMENTATION.md`는 이슈 #50의 Phase 0–7 체크리스트를 반영하고, `CONFORMANCE.md`는 이 저장소에서
도는 검사와 설치된 런타임·투자자 연결이 필요한 릴리스 게이트를 분리한다. 릴리스 게이트가 하나라도
열려 있는 동안 패키지는 게시되지 않는다.

## 스킬과 워크플로

`PROMPT.md`는 불변 실행 스켈레톤만 담는다. 조건부 세부는 다음에 산다:

- `theme-radar`: 선행 리서치 — 아이디어가 어디서 오는지, forward thesis가 무엇을 지녀야 하는지;
- `position-research`: 이미 보유한 것에 대한 매도 방향 감시, 가격과 펀더멘털을 병행해서;
- `evidence-gates`: 표본 독립성, maturity, 진입 게이트;
- `data-source-contract`: 엔드포인트, 시간 경계, 열화;
- `candidate-research`: lens별 why-cheap/trap/variant/benchmark 작업;
- `thesis-challenge`: 적대적 검토와 미해소 리스크 차단;
- `sizing-and-concentration`: 목표 비중, 상한, WATCH 위생;
- `outcome-calibration`: 포워드 성과 지표와 실패 분류;
- `memory-contract`: 키, revision, 격리, 마이그레이션;
- `deterministic-metrics`: 버전이 붙은 결정론적 계산 인터페이스.

스캐너, 사이징, 커버리지, 증거 채택, 보정, 귀속, 시점 고정 파싱, 스케줄 계산은 패키지의
`evidence-gated-metrics` MCP 서버를 통해 돈다. LLM 산문이나 대화형 Bash 승인에 의존하지 않는다.
`bin/evidence-gated-metrics`는 같은 코어를 운영자와 CI용 stdin-JSON/stdout-JSON으로 노출한다. 두
인터페이스 모두 파일시스템 원장, 자격증명, 네트워크, DB, 주문에 접근하지 않는다. 레거시 실행파일
65개와 헬퍼의 처리는 `MIGRATION.md`에, parity 케이스는 `fixtures/legacy-golden`에 있다.

같은 실행 코드가 승격 게이트의 클러스터 부트스트랩/walk-forward/FDR, 체결비용 반영 성과와 포워드
MFE/MAE 계산, 기계적 추세/DCA/과매도 백테스트, 스페셜리스트 슬리브 강제, 단일 Global 배분 분모,
스케줄 드리프트·지연 발화·중복 진단도 소유한다. 픽스처는 `kr`·`us`·`global`로 나뉘어 있어, 시장별
실패가 패키지 전체의 happy path에 가려지지 않는다.

`sizing-and-concentration`의 압축 예제가 WAIT·WATCH·BUY·SELL·RESIZE·REBALANCE를 다룬다. invocation
`language`가 한국어여도 와이어 키와 enum 값은 영어로 남고, 투자자가 읽는 산문만 번역된다.

## 마이그레이션과 출처

개인이 저술한 인스턴스에 한해, 일회성 부트스트랩이 활성 자산 주장을 Thesis로, 장부 결론을 Brief로,
살아 있는 검토 조건을 WATCH/plan으로, 원시 조사를 Evidence로, 그리고 집계된 표본/보정/실패 상태만
사설 메모리로 보낼 수 있다. `migration/schema-version`이 두 번째 임포트를 막는다. 공개 패키지는
항상 비어 있는 상태로 시작한다.

`aumos.json`에 기록된 커밋의 `morethanmin/trading-harness`에서 이식했다. 대응은 다음과 같다:

| 원본 개념 | Aumos에서의 자리 |
|---|---|
| 후보 lens와 리서치/챌린지 규칙 | 패키지 스킬 |
| 사용자가 안전하게 조절 가능한 문턱값 | config 스키마 |
| 자산별 저술된 주장/무효화 | Thesis |
| 국면/섹터/진입 보류 | Brief |
| 조건부 재확인 | WATCH / plan |
| 닫힌 표본과 보정 집계 | 사설 메모리 |

자격증명, 계좌/포지션 데이터, `data/*.jsonl`, SQLite, 캐시, 백업, `_workspace`, 개인 thesis 텍스트,
주문 구현, 과거 성과는 포함되지 않는다. 원본 하네스의 과거 결과는 Aumos 포워드 트랙레코드가
아니다. 저작자 표시는 `NOTICE.md`에 있다.

## 원본 하네스와의 parity

방법론은 이식된 것이지 바꿔 쓴 것이 아니다. `tools/legacy-parity.mjs`가 원본 Python 코어와 이
패키지의 결정론 코어를 같은 합성 입력으로 돌려 필드 단위로 비교한다 — 현재 21개 케이스, 59개 필드.
레거시 쪽 숫자는 한 번 측정해 `fixtures/legacy-golden/parity.json`에 얼려두므로, 여기서는 Python도
비공개 체크아웃도 없이 비교가 돈다. 둘이 의도적으로 갈라지는 자리는 `MIGRATION.md`가 어느 필드가
어느 방향으로 왜 갈라졌는지 적고, 픽스처가 그 차이를 단언하므로 조용히 되돌릴 수 없다.

## 알려진 한계

- `open-dart`를 설치하지 않으면 KR 단일종목 펀더멘털 진입/승격 레인이 막힌다. 소스는 게시돼
  있다([#51](https://github.com/untilled/aumos-catalogue/issues/51)). 설치하지 않았거나 API 키가
  없는 기계는 한국 펀더멘털을 판단할 수 없는 기계다.
- **`thesis:read`와 `evidence:read`는 선언돼 있고 현재 Aumos 빌드에서 아무것도 서빙하지 않는다.**
  매니페스트 어휘에는 둘 다 있지만 `grant.ts`가 각각을 빈 도구 목록으로 매핑하므로 실행에
  `thesis_read`/`evidence_read` 도구가 생기지 않는다. 프롬프트가 *가능할 때* 읽는다고 적고
  매니페스트가 둘을 `optionalSkills`에 두는 이유가 정확히 그것이다. Aumos가 서빙하기 전까지 자산
  주장은 invocation 페이로드와 Brief로 실행에 닿고, 패키지는 하지 못하는 조회를 하는 척하는 대신
  그렇게 말한다. `RunProvenance.unservedTools`가 그 차이를 기록하는 자리다.
- **페이퍼 트랙은 인스턴스 사설 메모리에 산다 — 담을 수 있는 곳이 그것뿐이기 때문이다.** 페이퍼
  콜은 주문도 체결도 없으므로 Decision이 아니고, 런타임은 `thesis:write`를 내지 않으며
  `thesis:read`는 도구를 하나도 주지 않는다. 그래서 `learning/paper-cohorts`가 누적 합과 열린 관측
  창의 색인을 지닌다. 결과 둘이 따라오고 어느 쪽도 숨기지 않는다: 같은 장부의 다른 매니저는 이
  증거를 볼 수 없고, 새 매니저 인스턴스는 트랙을 처음부터 다시 시작한다. 공유 기록이 옳은 집이지만,
  런타임이 서빙하는 것은 이것이다.
- 선행 리서치와 매도 방향 계층은 이식됐지만 그 트랙레코드는 아니다. `theme-radar`는 `thesis_call`
  페이퍼 포지션을 내고 `sectorStrength`는 그것들이 비교될 기계 베이스라인 둘을 기록한다. "팀의
  콜이 지수와 봇을 *둘 다* 이기는가"에 답하는 비교는 닫힌 관측 창이 수개월 쌓여야 무언가를 말한다.
  그때까지 리서치 계층의 엣지는 베이스라인의 엣지와 똑같이 가설이다.
- 소스 벤더는 자기 응답 모양을 그대로 중계한다. 날짜와 신선도를 검사하는 것은 Aumos가 아니라 이
  매니저다.
- CLI web 관측은 replay 정본 Evidence가 아니다.
- 보정은 검토된 패키지/config 변경 없이 방법론을 승격하거나 다시 쓸 수 없다.
- 실제 증권사 연결 paper/shadow와 다중 실행 격리 검사는 설치된 Aumos 런타임과 자격증명을 요구하며
  이 카탈로그 저장소가 시뮬레이션하지 않는다.
