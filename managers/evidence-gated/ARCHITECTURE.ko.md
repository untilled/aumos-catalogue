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
| 포트폴리오 공통 결론 | Brief — 이 장부의 공유 폴더 `book/` | 국면, 섹터 견해, 신규 진입 보류 |
| vendor 원시 조사 | Evidence | 벤더 가격·공시·뉴스 페이로드 |
| 재검토 약속 | WATCH / plan | 가격·날짜·공시 트리거와 만료 |
| 학습 집계 | 이 인스턴스의 사설 폴더 `state/` | lens 표본, 보정, 반복 실패 |
| 실제 판단과 성과 | Decision journal / Forward Track Record | BUY/WAIT/SELL과 포워드 결과 |
| 영구 규칙 | 패키지 버전 / config | 승인된 문턱값 또는 방법 변경 |

⚠️ **저장 둘은 `untilled/aumos#743`에서 폴더가 됐고**, 위의 소유 구분도 아래의 제약도 함께 움직이지
않았다: 사설 기록은 `memory_read`/`memory_write`가 있던 자리에서 이 인스턴스 자기 폴더에 대한
`files_list`/`files_read`/`files_write`이고, 장부의 공유 결론은 `brief_read`/`brief_write`가 있던
자리에서 `book/`에 대한 `fund_files_*` 여섯이다. 폴더는 더 큰 주소 공간이지 더 큰 허가가 아니다 —
키로 거절됐을 기록은 경로로도 거절된다. 그래서 사설 폴더에는 활성 thesis, raw evidence 본문, 공유
Brief 내용, 실행 gate, 주문/체결, 낡은 소스 데이터 사본, 자기 승인 규칙 변경을 절대 넣지 않는다.
Brief는 같은 장부의 다른 매니저가 읽을 수
있고, 사설 폴더는 이 **매니저 인스턴스**로 범위가 한정된다. 다른 인스턴스는 공유하지 않는다.
모델 교체는 다른 인스턴스가 아니다 — 폴더의 키가 인스턴스 하나이므로 그것을 쓴 모델보다
오래 살고, 끝내는 것은 매니저 삭제다.

## 데이터 아키텍처와 설치 정책

Toss·Alpaca 시장 엔드포인트는 이 펀드에 이미 연결된 로그인을 통해 중계된다. 자격증명은 그 연결에
남고 데이터 소스로 다시 입력하지 않는다. 완전한 US 단일종목 레인은 두 연결을 붙이고 `sec-edgar`를
설치한다. `openbb-fmp`는 선택이고 장기 가격 이력을 보충할 때만 쓴다. 완전한 KR 단일종목 펀더멘털 레인은
이 패키지와 함께 이 카탈로그에 게시된 `open-dart`를 추가로 요구한다. 설치되지 않은 곳에서는 KR
ETF와 기존 보유의 가격/비중 관리는 펀더멘털 불확실성을 진술한 채 돌 수 있지만, 신규 KR 단일종목
펀더멘털 BUY나 thesis 승격은 판단 불가 WAIT다 — 아무도 갖지 못한 기능이 아니라, 이 기계가 소스를
설치하지 않은 것이다.

모든 릴레이 호출은 invocation의 `asOf`를 받는다. Aumos가 Toss·Alpaca 요청의 선언된 경계
파라미터를 그 실행에 맞추고, 매니저는 그대로 돌아온 답에서 그 이후 row를 다시 폐기하며 시장 가용성으로
신선도를 잰다: SEC는 `filed`, OpenDART는 접수 시각/번호, 뉴스·기업행위는 공개·공시 시각, 가격은
bar 시각. 항상 현재 상태를 돌려주는 스냅샷은 replay 소스가 아니다. adjusted와 unadjusted 계열을
절대 섞지 않고, 불연속은 기업행위로 설명한다.

⛔ **`asOf`로 경계가 잡힌 것은 «완결»과 다르다.** 토스의 `before`는 포함(`≤`)이고 일봉은 거래소
현지 자정에 찍히므로, 장중에 고정된 실행이 그날 자정을 넘기면 그날의 **미완성** 봉을 받는다 — OHLCV가
전부 있고 숫자형이라 **형태는 유효하고 데이터가 틀린** 경우이며, 그래서 모든 파싱 검사가 통과시킨다.
처방은 `skills/data-source-contract/SKILL.md`에 있다: 인스턴트는 **전날 안쪽**으로 넘기고, 그 뒤에
첫 행의 날짜를 직접 확인하며, 일봉이 읽을 수 있게 되는 24시간보다 어린 최신 봉은
`newest_bar_may_be_unclosed`가 **거절 없이** 보고한다.

⛔ **그리고 «adjusted와 unadjusted를 절대 섞지 않는다»는 뒤에 아무것도 없던 문장이었다**(#248).
닫히지 않은 봉 하나가 위의 모양이고, 그 옆이 **전부 닫혔는데 한 가격 역사에 속하지 않는 봉 이백
개**다 — #248까지 이 패키지의 어떤 검사도 파생된 값을 그것이 파생된 가격에 대고 비교하지 않았다.
2026-09-09 US 스윕에서 잰 것: BKNG이 `close` 193.29에 `ma200` **2,316.55**을 답하고, VZ가
`low200` 10.5999 위로 `aboveLow200` **+373%**를 답했다 — 둘 다 낙폭이 아니라 미조정 분할이거나
창 중간에서 멈춘 조정 계수다. BKNG의 `discoveryScore` 20은 **전적으로** 거기서 나왔고, 그 점수가
`offHigh200`·`ma200Distance`를 읽으므로 가격 분기의 순위 자체가 부분적으로 그 인공물로 만들어져
있었다. 이제 `price_series_discontinuity_suspected`(`info`)가 마지막 200봉에 대해 세 가지를
보고한다 — `close/ma200`이 [0.1, 10] 밖 · `high200/low200`이 [1, 20] 밖 · 인접 세션 로그수익률이
±50%를 넘는 지점의 **개수** — 그리고 `indicators.discontinuity`는 **아무것도 의심되지 않아도** 그
개수를 싣는다: «어떤 세션도 50% 넘게 움직이지 않았다»가 `offHigh200`을 읽을 수 있게 만드는 사실
이기 때문이다. ⚠️ 거절하지 않는다 — 실제로 분할한 이름이 정확히 이 모양이고 그 역사는 정확히 옳으
므로 판정은 판독자의 것이다. 틀렸던 것은 판독자가 그것을 알 방법이 없었다는 것이다. ⛔ 조정을 다시
유도하지도 않는다: 이 패키지가 재기준한 계열은, 첫 저자가 벤더인 가격 역사의 두 번째 저자가 되는
일이다.

| 누락 | 계속 가능 | 차단 |
|---|---|---|
| Toss 연결 | 기존 Evidence/Thesis 검토 | 신규 가격 신호와 목표 계산 |
| `sec-edgar` | KR/ETF 레인 | 신규 US 펀더멘털 BUY/승격 |
| Alpaca 연결 | SEC/Toss 검토 | 뉴스·기업행위 확인이 필요한 신규 판단 |
| `open-dart` | KR ETF와 가격/비중 관리 | 신규 KR 단일종목 펀더멘털 BUY/승격 |
| CLI web | core/exit/비중 관리 | theme radar, variant view, 컨센서스 차이, 정책·매크로 주장 |

매니페스트가 `connection:passthrough` 권한에 Toss·Alpaca를, `source:passthrough` 권한에
`sec-edgar`·`open-dart`를 이름 댄다. 그래서 설치 화면이 실행이 발견하기 전에 이 펀드에 어느 연결이,
이 기계에 어느 소스가 없는지 말할 수 있다. `openbb-fmp`는 선택이라 적지 않았다. 소스를 이름 대는
것이 소스 게이트웨이를 좁히지는 않는다 — 실행은 여전히 기계에 설치된 모든 소스를 본다.

⚠️ **`observation:file`은 기록을 읽는 것이 아니라 기록에 넣는 유일한 권한이다**(`untilled/aumos#693`).
위 degradation 표에서 CLI web은 컨센서스 차이 주장의 경로인데, #693 전까지 그 경로는 아무 데도
닿지 않았다 — `WebSearch`·`WebFetch`는 CLI의 도구라 이 게이트웨이를 지나지 않고, `evidenceIds`는 이
게이트웨이가 민팅한 id 말고는 받지 않는다. `observation_file`은 URL과 발행일과 원문 그대로의 구절을
받아 해시를 덮고 id를 돌려준다. ⛔ Aumos는 아무것도 가져오지 않고 검증하지 않으므로, 그 행은 매니저의
증언으로 기록되고 그 사실을 표지 둘로 나른다 — kind `observation`, source `manager:web-research`.
이 패키지는 그 등급을 `variantViewCheck`에서 읽고, `effectivePositionCap`을 지나 제안의
`rationale.risks`까지 나르며, 반대 방향은 `observationLedger`가 감사한다 — 웹에서 읽어 판단에 썼는데
제출된 id가 받치지 않는 값은 거부된다. ⚠️ **표지는 영수증에 달려 있으므로 claim의 등급도 거기서
온다** — 같은 호출에 넘긴 관측이 그 claim을 등급하고, 그 호출의 어느 영수증도 들고 있지 않은 id는
`ungraded`로 답하지 않고 `claim_grade_unstated`로 이름을 댄다: «여기서는 말할 수 없다»는 판독이
아니다(#176).

OpenDART의 동작 셋은 매니저의 몫이다. Aumos가 읽지 않고 중계하기 때문이다: `corpCode.xml`은
ZIP으로 답하고(대신 `list.json`의 `corp_code`/`stock_code`를 읽는다), 오류가 HTTP 200의 `status`
필드로 도착하며(한도 거절은 빈 결과가 아니다), XBRL 재무제표는 정기보고서를 따라오므로 잠정으로만
발표된 분기에는 제표가 없다 — 기록할 공백이지, 잠정 수치로 메울 공백이 아니다.

CLI web은 Alpaca 부재 시 뉴스·기업행위·분배금·컨센서스의 대체 경로이며 IR·정책·매크로·테마를 조사한다.
매 사이클 보유분을 조사하고, 부여됐으나 미조회한 경로는 `lane_not_queried`로 부재·실패와 구별한다.
replay 정본 Evidence가 아니다: 실행은 확인한
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

패키지는 `skills/memory-contract/SKILL.md`의 안정 **경로**를 쓰며 종목과 Evidence 참조를 담는 제한된
`coverage/research-index`를 포함한다. ⚠️ **키는 바뀌지 않았고 경로가 됐다**(`untilled/aumos#743`) —
안정 키마다 앞에 `state/`, 뒤에 `.json`이 붙은 것이라 실행이 읽고 쓰는 것은 여전히 같은 열일곱 개
기록이며 주소만 키에서 경로로 바뀌었다. ⛔ **이 패키지가 소유한 나머지 두 폴더는 그 기록이 아니다**:
`scans/`는 호스트가 쓰는 recipe 답이 앉는 곳이고 `proposals/`는 그 실행이 조립한 것이며, 어느 쪽도
학습 키로 읽히지 않는다. 동봉한 KR 74종·US 83종 명부가 재현 가능한 조사 범위이며,
펀더멘털 캐시는 여전히 호스트 소스 저장소가 필요하다. 두 번째 제한적 예외인 `research/catalyst-window`(#169)는
발굴 렌즈가 읽는 촉매 달력 — 사건 이름 · 창 · 관측 시각 · Evidence id — 을 나른다. 그 시각들이
숫자인 이유는 촉매 창이 구조적으로 `asOf` 뒤에 끝나고, `asOf`보다 늦은 **문자열** 시각이 바로
`memory_read`가 거절**했던** 그 모양이기 때문이다. ⚠️ **그 거절은 파일에 닿지 않는다** —
`files_read`는 문서를 불투명한 문자열 하나로 돌려주고 나가는 스캔은 앵커돼 있으므로, JSON 본문은
타임스탬프가 아니고 그 잎은 훑어지지 않는다 — 그래도 인코딩은 남으며, 이제는 양보가 아니라 이
패키지 자신의 정본이다(§알려진 한계). ⛔ 이벤트 기록은 저장하지 않는다 — `sue` ·
`day1ExcessPct` · `preAnnouncementClose`는 벤더의 답에서 베낀 숫자라 매 런 다시 읽는다.
⚠️ **생산자는 작동했고 등록 경로가 그것에 닿지 못했다**(#249). `catalystCadence`가 이 북 최초의
유도 창을 답했는데 — 자기 캐시에서 잰 21건에 대한 중위 지연 32일 — 그것은 계산된 뒤 버려졌다:
`estimated[]`가 문단으로 공표되고 그 옆의 `catalysts[]`는 필드 표였으므로, 배울 틀린 철자가 없는
호출자가 세 형태를 추측했고 등록된 유일한 하나는 `catalysts`에 둔 두 번째 사본에서 표식을 떼어
추정을 **확정일**로 기록했다. 이제 행 형태가 필드 단위로, 생산자가 답하는 것과 1:1로 공표된다.
`catalystCadence`는 `registerAs: { estimated }` — 그 배열을 받는 인자 이름 아래 얹은 같은 배열 —
를 되돌려 주고, 같은 `(market, symbol, event)`가 두 배열에 함께 오면
`catalyst_estimate_unmarked` / **blocked**다: 접기가 확정 사본을 지키고, 그것이 이 축이 절대
만들어서는 안 되는 판독이기 때문이다.
예약 메모리는 이 인스턴스가 **약속한** 것 중 시각이 지나지 않은 것이다 —
실행이 계산한 시퀀스의 사본도 아니고, ⛔ `decisions[].armed`로 검증되지도 않는다(그 필드는 과거형이라
약속이 서 있는 동안 오히려 기록에서 지운다, #156). `asOf`에 서 있던 것은 invocation의
`standingPlans`에서 읽고, **보고 전용** 인자로 같은 연산에 넘겨 행위가 아니라 보고에 쓴다 —
`standingArms`라는 바닥을 답할 뿐이고 무장할 목록에도 되쓸 상태에도 닿지 않는다(#201). 값은 스키마
버전, 갱신 시각, 뒷받침하는 Decision/Evidence id, 표본·독립 클러스터 수, 계산 가능한 지표, 결측
필드, maturity 상태를 지닌 JSON 객체다. 쓰기는 안정 경로를 재사용하며 집계가 바뀔 때만 일어난다.

⚠️ **런타임이 지켜 주던 성질 셋이 이제 이 패키지의 몫이고, 각각을 명시적으로 지킨다**
(`untilled/aumos#743`). 쓰기는 revision을 덧붙였고 잃을 것이 없었다. 파일은 덮인다. 그래서 앞의 값이
계속 읽혀야 하는 자리 — 추세 자체가 요점인 보정 계열, 나중 실행이 diff해야 하는 명부 — 에서는 안정
경로 **옆에** 날짜가 붙은 형제 파일을 쓴다(`state/calibration/mean-reversion.2026-09-08.json`).
안정 경로 자체에 날짜를 붙이는 것은 아니다. ⛔ 읽기는 시점에 고정되지 않는다: `memory_read`는 `asOf`
이하의 최신 revision을 답했고 `files_read`는 지금 디스크에 있는 바이트를 답하므로, 값 자신의
`updatedAsOf`가 시점을 말하는 유일한 신호이고 invocation `asOf`보다 늦은 값은 미래 revision이 늘
그랬듯 건너뛰고 진단한다. 그리고 두 필자를 갈라 두던 것이 append였는데, 이제는 매 쓰기의
`expectedHash` 비교-교환이고 불일치는 `revision-conflict`이며 답은 실제로 거기 있는 것을 다시 읽고
다시 정하는 것이다. 비었거나
손상된 메모리는 진단에 남기고 안전하게 무시하므로 — `no-such-file`이 바로 그 «빔»이고 첫 실행에는
그것이 열일곱 개다 — 첫 실행도 유효한 WAIT·WATCH·조건부 BUY를
돌려준다.

레퍼런스 계약을 로컬에서 재현하려면:

```sh
node tools/verify-evidence-gated-allocator.mjs
```

픽스처가 증명하는 것: 실행 A → 실행 B 지속성, 같은 키의 append-only revision, 과거 replay,
인스턴스 격리, 모델 교체 후의 연속성, 공유 Brief와 사설 메모리의 분리, audit/Evidence 관측 가능성, 빈 메모리 동작,
손상 메모리 열화. ⚠️ **그중 둘은 이제 존재하지 않는 런타임 성질을 모델한다** — append-only revision과
`asOf` 이하 최신 revision을 읽는 replay는 `memory_read`/`memory_write`의 것이었고
`untilled/aumos#743`에서 함께 갔다. 지우지 않고 남긴 이유는 그것들이 단언하는 것이 여전히 빚이고 다만
빚지는 쪽이 이쪽이 됐기 때문이다: 날짜 붙은 형제 파일이 그 append이고 `updatedAsOf` 검사가 그
replay다. 케이스 이름은 옛 런타임의 것이며 고쳐진 것이 아니라 물려받은 것이다.
미래 row 제거, 신선도, 소스 충돌, adjusted/unadjusted 혼합도 검사한다. 픽스처는
결정론적 계약 모델이다. 릴리스 후보는 설치된 Aumos 런타임과 Toss 연결 페이퍼 포트폴리오를 상대로
같은 케이스를 paper/shadow 실행에서 한 번 더 반복해야 한다.

`IMPLEMENTATION.md`는 이슈 #50의 Phase 0–7 체크리스트를 반영하고, `CONFORMANCE.md`는 이 저장소에서
도는 검사와 설치된 런타임·투자자 연결이 필요한 릴리스 게이트를 분리한다. 릴리스 게이트가 하나라도
열려 있는 동안 패키지는 게시되지 않는다.

## 스킬과 워크플로

`PROMPT.md`는 불변 실행 스켈레톤만 담는다. 조건부 세부는 다음에 산다:

- `orchestrate`: 이 웨이크가 어느 플로우의 것인지, 단일 슬리브 실행이 무엇을 낼 수 있는지, 플로우를 어떻게 디스패치하는지, 그리고 디스패치할 때 이 세션이 실제로 쥔 레인이 무엇인지;
- `theme-radar`: 선행 리서치 — 아이디어가 어디서 오는지, 매 실행이 유니버스 밖에서 하나는 봐야 하는 축, forward thesis가 무엇을 지녀야 하는지;
- `position-research`: 이미 보유한 것에 대한 매도 방향 감시, 가격과 펀더멘털을 병행해서;
- `evidence-gates`: 표본 독립성, maturity, 진입 게이트;
- `data-source-contract`: 엔드포인트, 시간 경계, 열화, 그리고 벤더 에러를 무엇으로 기록해도 되는가;
- `candidate-research`: 이 실행이 훑을 유니버스를 선언하는 일, 그리고 lens별 why-cheap/trap/variant/benchmark 작업;
- `thesis-challenge`: 적대적 검토와 미해소 리스크 차단;
- `sizing-and-concentration`: 목표 비중, 상한, WATCH 위생;
- `outcome-calibration`: 포워드 성과 지표와 실패 분류;
- `memory-contract`: 안정 경로, 런타임이 더 이상 지켜 주지 않는 이력·해시 규칙, 격리, 마이그레이션;
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
인스턴스의 사설 폴더로 보낼 수 있다. `migration/schema-version`이 두 번째 임포트를 막는다. 공개
패키지는 항상 비어 있는 상태로 시작한다.

⛔ **이 패키지는 `untilled/aumos#743` 이전의 자기 기록을 마이그레이션하지 않고, 그것은 의도다.**
`memory_write`·`brief_write`가 저장했던 것을 두 폴더로 내보내는 것은 호스트의 일회성 단계이고,
패키지까지 그것을 베끼면 자기 것이 아닌 경로를 놓고 첫 번째 필자와 경주하는 두 번째 필자가 된다.
그래서 빈 `state/`는 빈 학습 상태로 읽히고 실패한 마이그레이션으로는 절대 읽히지 않는다 — 첫 실행이
언제나 살아남아야 했던 그 읽기다.

`aumos.json`에 기록된 커밋의 `morethanmin/trading-harness`에서 이식했다. 대응은 다음과 같다:

| 원본 개념 | Aumos에서의 자리 |
|---|---|
| 후보 lens와 리서치/챌린지 규칙 | 패키지 스킬 |
| 사용자가 안전하게 조절 가능한 문턱값 | config 스키마 |
| 자산별 저술된 주장/무효화 | Thesis |
| 국면/섹터/진입 보류 | Brief |
| 조건부 재확인 | WATCH / plan |
| 닫힌 표본과 보정 집계 | 인스턴스의 사설 폴더 |

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
- **`thesis_read`와 `evidence_read`는 어느 빌드도 서빙한 적 없는 철자이고, 그 뒤의 권한은 같은
  물건이 아니다.** ⚠️ **이 항목은 «선언된 권한 둘이 아무것도 서빙하지 않는다»라고 적혀 있었고, 그
  절반이 참이 아니게 됐다**: `thesis:read`와 `evidence:read`는 서빙되며, 이 패키지가 한 번도 쓴 적
  없는 이름으로 — `thesis_list`/`thesis_get`과 `evidence_get`/`evidence_search` — 나온다. 남는 것은
  이 항목이 있던 이유다: 권한의 철자와 도구의 철자는 두 어휘이고, 매니페스트의 `optionalSkills`가
  이름 대는 것은 두 번째이며, 그 필드는 기계가 읽고 실행은 읽지 않는다.
  ⚠️ **실행이 읽는 쪽은 «가능할 때»라고 적고 있었고 그것으로는 부족했다**(2026-09-01): 진짜 세션
  하나가 `thesis_read`·`evidence_read`·`manager_memory_read`를 찾아다녔고 — 셋 다 그 이름으로는 어느
  빌드도 서빙한 적이 없다 — 그 어긋남을 스스로 보고했다. «가능할 때»는 «불러 보고 알아내라»로 읽히고,
  부르는 데는 턴이 든다. `PROMPT.md`와 `skills/orchestrate/SKILL.md`는 서빙되는 것만 이름
  대고 그 셋이 도구가 아니라고 잘라 말한다. 세션이 서빙된 짝을 쥐지 못한 곳에서 자산 주장은 invocation
  페이로드와 장부의 공유 폴더로 실행에 닿고, 패키지는 하지 못하는 조회를 하는 척하는 대신 그렇게 말한다. `RunProvenance.unservedTools`가 그 차이를 기록하는 자리다.
- **매니저는 WATCH를 걸 수는 있고 그것을 돌려주는 도구는 없다.** 권한→도구 맵은 `portfolio_read`,
  장부의 공유 폴더에 대한 `fund_files_*` 여섯, 이 인스턴스 자기 폴더에 대한 `files_*` 여섯,
  `task_start`/`task_get`/`task_cancel`, `source_request`, `connection_request`를
  내놓고, watch나 plan
  권한은 아예 없다 — 선언만 되고 빈 목록인 것조차 아니다. WATCH는
  `DecisionProposal`로 나가기만 하고 그것을 돌려주는 도구가 없다. 호스트가 대신 게시한 것은
  invocation의 필드 `standingPlans`이고, 그것은 천장이 아니라 바닥이다 — 그래서 실행은 자기가
  다시 거는 검토를 볼 수는 있어도, **안 보이는** 약속이 사라졌다고는 말할 수 없다.
  #87 이후로 그 비용이 커졌다: 웨이크마다 플로우 하나를 디스패치하므로,
  30분 간격의 `kr-sleeve` 검토 둘이 각각 한국 슬리브를 돌리고 각각 판단을 봉인한다.
  `run/armed-reviews`와 `reconcileArmedReviews`가 그 다리다 — 매니저가 약속한 것을 적어둔다 —
  그리고 다리일 뿐이다: 사설 메모리는 인스턴스 범위라 새 인스턴스는 눈이 먼 채 시작하고 기록은
  Aumos가 든 것과 갈라질 수 있다.
  ([#97](https://github.com/untilled/aumos-catalogue/issues/97))
  ⛔ **그리고 그 다리가 중복을 막지는 않는다.** `decisions[].armed`는 과거형이다 — 이미 *끝난*
  약속이 어떻게 됐는지를 나른다 — 그래서 그것을 수신증으로 읽은 두 실행이 깨끗이 무장된 것을
  실패로 판정하고 시장 리뷰 셋을 두 번 더 무장했다. ⚠️ **지금 무엇이 무장돼 있는지는 이제 답이
  있다** — `untilled/aumos#690`으로 `ManagerInvocation.standingPlans`가 들어왔고, `asOf`에 서
  있던 약속을 `planId`·`armedAt`·`armedByDecisionId`·`expiresAt`·`intent`·`trigger`와 함께
  나른다 — 그리고 그것이 바꾸는 것은 **보고할 수 있는 것**이지 무장하는 것이 아니다: 그 필드는
  바닥이지 천장이 아니고(시각을 댈 수 없는 약속은 추측하지 않고 빠진다) 그 규칙을 스스로 말한다.
  `reconcileArmedReviews`가 그것을 보고 전용 인자로 받아 `standingArms`를 답하고, 그 값이 자기
  모양으로 바닥임을 말한다; ⛔ **안 받은 것**은 «읽을 수 없음»이고 **`[]`를 받은 것**은 바닥이
  0이며, 둘은 다른 사실이다(#201).
  그래서 이 패키지는 여전히 매 판단마다 무장하고, 호스트가 접는다. ⚠️ **이제 접기가 둘이고
  원장 쪽이 나중에 들어왔다.** 발화 시각의 접기는 인스턴스별로 같은 instant를 접고
  (`untilled/aumos#593`, `untilled/aumos#624`) 그것만으로는 부족했다 — 플랜 **행**은 남고 지우는
  동사가 없어서 이 북이 3 / 3 / 2 깊이로 쌓였고 그것이 `untilled/aumos#704`다. PR
  `untilled/aumos#712`가 도구도 AMP 필드도 늘리지 않고 호스트 쪽에서 닫았다: 무장 시각의 접기가
  **같은 약속**을 — `kind`·`subject`·`intent`·`trigger`를 쓰인 바이트로 비교하고 `expiresAt`은
  일부러 뺀다 — 판단을 봉인하는 그 트랜잭션 안에서 접어 옛 행을 `rearmed`로 은퇴시킨다.
  ⬜ 머지가 배포는 아니다: `v0.3.32` 뒤에 들어왔으므로 그보다 오래된 호스트는 그 행을 그대로 든다.
  기록이 여전히 답하고 어느 접기도 답하지 않는 것은 같은 플로우를 **다른** instant로
  약속했는가이고 — 동일성이지 닮음이 아니라서 그것은 두 행으로 남는다 — 그것이 정확히 #87의
  해악이며, 살아 있는 행 위의 바닥은 그것을 «애초에 안 한 약속»과 구별하지 못한다.
  ⚠️ **남는 유일한 중복이 되면서 익명으로 보고할 수 없게 됐다**: `review_superseded`가 이제 orphan의
  `planId`를 싣고, 그것은 이 패키지가 스스로 쓴 `market-review:<flow>:<at>` 마커와 instant로
  `standingPlans`에서 찾은 것이다. 이름을 못 대면 어느 침묵인지를 말한다 —
  `superseded_address_unreadable`(이 호출이 `standingPlans`를 못 받았다) ·
  `superseded_address_unnamed`(받았는데 아무 행도 안 맞았다). ⛔ 어느 쪽도 orphan이 사라졌다는
  증거가 아니고, 어느 쪽도 무장할 것을 좁히지 않는다.
  ([#156](https://github.com/untilled/aumos-catalogue/issues/156),
  [#175](https://github.com/untilled/aumos-catalogue/issues/175),
  [#202](https://github.com/untilled/aumos-catalogue/issues/202))
  단일종목 분할 진입도 같은 이유로 같은 다리를 탄다: `entryTranchePlan`이 채워지지 않은 각 트랜치를
  무장할 `intent`를 돌려주고, `resolveTrancheWake`가 발화한 plan의 이벤트 summary에서 그 마커를
  다시 읽는다 — 읽을 것이 그것밖에 없기 때문이다.
  ([#120](https://github.com/untilled/aumos-catalogue/issues/120))
- **미래나 날짜를 담은 durable 키는 되읽을 수 없었다 — 그리고 규칙이 아니라 기록이 움직였다.**
  `memory_read`는 ISO-8601 모양이면서 `asOf`
  보다 뒤인 문자열이 하나라도 있으면 결과 전체를 거부했고, 매칭 패턴은 **날짜만 있는 형태도**
  포함했다 — bare `2026-09-05`는 그 날의 **끝**과 비교됐다. SEC의 `filed`가 뜻하는 것이 그것이기
  때문이다. `run/armed-reviews`는 구조적으로 미래이고 `run/watch-alerts`는 현재 세션을 이름으로
  담았으므로, 둘 다 정상 동작에서 거부됐다. `untilled/aumos#659` 이전에는 거부가 키 단위가 아니라
  읽기 단위였고, 그래서 오염된 키 하나가 키 없는 네임스페이스 읽기 전체를 죽였다. 그 읽기는 뒤에
  엔트리 단위로 접히고 떨군 키를 `omitted.keys`로 이름 대서 돌려줬지만, 그 키 자체는 여전히 읽히지
  않았다. 패키지 쪽 답은 타임스탬프 모양의
  문자열을 쓰지 않는 것이었다: 실제로 순간인 값에는 epoch ms, 애초에 순간이 아니었던 필드에는
  `session-` 접두사 라벨.
  ✅ **`untilled/aumos#743`이 그 거절을 끝냈고, 가드를 느슨하게 해서가 아니라 기록을 가드 밖으로
  옮겨서다.** `files_read`는 문서를 불투명한 문자열 하나로 답하고 나가는 스캔은 앵커돼 있으므로 JSON
  본문은 타임스탬프가 아니고 그 잎은 훑어지지 않는다. 키 없는 읽기의 붕괴도 재현될 수 없다 — 폴더는
  모든 키를 한 payload로 가져오는 대신 나열되고 경로로 읽힌다. ⛔ **두 인코딩은 남고**, 이제는
  양보가 아니라 이 패키지 자신의 정본이다: 뜻은 처음부터 동일했고, 여기의 모든 독자가
  `atEpochMs`·`windowStartEpochMs`와 `session-` 라벨을 읽으며, 풀린 제약을 기념하려고 저장된 기록을
  다시 인코딩하는 것은 얻는 것이 없고 어느 독자도 파싱 못 하는 이력을 만든다.
  ⛔ 나머지 절반은 애초에 면제가 아니었고, 그것은 다시 열린 것이 아니라
  결정된 채로 남는다 — 어느 필드가 예정인가는 매니저의 사적 스키마이고, 그것을 아는 게이트웨이는 모든
  매니저의 필드 목록이라는 두 번째 표다.
  ([#136](https://github.com/untilled/aumos-catalogue/issues/136),
  [untilled/aumos#658](https://github.com/untilled/aumos/issues/658),
  [untilled/aumos#659](https://github.com/untilled/aumos/issues/659),
  [untilled/aumos#743](https://github.com/untilled/aumos/issues/743))
- **페이퍼 트랙은 이 인스턴스의 사설 폴더에 산다 — 담을 수 있는 곳이 그것뿐이기 때문이다.** 페이퍼
  콜은 주문도 체결도 없으므로 Decision이 아니고, 런타임은 `thesis:write`를 내지 않으며
  `thesis:read`가 주는 것은 읽기 경로(`thesis_list`/`thesis_get`)라 페이퍼 코호트를 써넣을 자리가
  없다. 그래서 `state/learning/paper-cohorts.json`이 누적 합과 열린 관측
  창의 색인을 지닌다. 결과 둘이 따라오고 어느 쪽도 숨기지 않는다: 같은 장부의 다른 매니저는 이
  증거를 볼 수 없고, 새 매니저 인스턴스는 트랙을 처음부터 다시 시작한다. 공유 기록이 옳은 집이지만,
  런타임이 서빙하는 것은 이것이다. 트랙을 끝내지 *않는* 것: 모델 교체, config 편집, 제자리 패키지
  업데이트 — 행의 키가 인스턴스 하나라서 d60 창은 열어 둘 값어치가 있다.
  ([untilled/aumos#638](https://github.com/untilled/aumos/pull/638))
- 선행 리서치와 매도 방향 계층은 이식됐지만 그 트랙레코드는 아니다. `theme-radar`는 `thesis_call`
  페이퍼 포지션을 내고 `sectorStrength`는 그것들이 비교될 기계 베이스라인 둘을 기록한다. "팀의
  콜이 지수와 봇을 *둘 다* 이기는가"에 답하는 비교는 닫힌 관측 창이 수개월 쌓여야 무언가를 말한다.
  그때까지 리서치 계층의 엣지는 베이스라인의 엣지와 똑같이 가설이다.
- **장중 웨이크는 온다. 그리고 런타임이 이식 원본보다 더 일반적이다.** Aumos의 Wake Engine은
  60초마다 틱을 돌며 `price-below`·`price-above`·`weight-drift`를 실시간 시세로 평가하고,
  장중 여부로 거르지 않는다 — 원본 하네스가 미장 시간에 US 전용 스크립트 하나를 돌린 자리다.
  시장 자격증명이 없으면 트리거를 "발화 안 함"이 아니라 `unevaluated`로 보고하는데, 이는
  `evaluateWatch`가 `unevaluable`로 돌려주는 것과 같은 구별이다. 매니저 쪽이 지는 몫은 실시간
  읽기를 확정된 숫자로 다루지 않는 것이고, 그게 `confirmationPending`이다.
  ([#88](https://github.com/untilled/aumos-catalogue/issues/88))
- **실행은 판단을 봉인하거나 실패로 기록되거나 둘 중 하나다. 세 번째 답은 없다.**
  `ManagerRunOutcomeKind`는 `decided`·`invalid-proposal`·`no-proposal`·`refused`·`unsound`이고,
  `no-proposal`은 JSON을 아예 회수하지 못했다는 뜻 — 제안하지 않기로 한 매니저가 아니라 포워드
  트랙레코드의 실패 행이다. 그래서 닿은 레벨로 깨어난 실행은 **`WAIT`을 제출한다**: 무엇에
  깨어났고, 무엇을 찾았고, 무엇이 아직 닫힌 봉을 요구하고, 무엇을 다시 걸었는지 말하는 WAIT.
  침묵은 기계적으로 가능하지만 크래시로 채점된다.
- **성숙도 레인은 없앴다 — 크기는 Mandate가 정하고, 증거 게이트는 거절한다.** 원본 방법론은
  기계적 대조군 — variant view를 요구하지 않는 대신 종목당 1%·레인 총 6% — 과, variant view를
  요구하는 대신 투자자 자신의 `maxPositionWeight`까지 실을 수 있는 정식 편입 레인을 함께 돌렸다.
  이식본은 §4의 렌즈 성숙도 상한을 **두 레인 모두**에 걸었고, 그래서 선언된 `maxPositionWeight`
  0.20이 0.01로 작동했다. #153이 두 레인을 다시 갈랐고, **#226이 두 캡을 전부 없앴다** —
  2026-09-08 투자자 결정: *"실험 레인은 없애고 실제로 aumos의 mandate에 따라 매수하면서 실험하는
  방향으로 바꿔라."*
  ⚠️ **실제 매수 자체가 이미 측정 장치다** — 실제 브로커에 붙어 있고, 모든 주문이 사람의 승인을
  거치며, 모든 판단이 전방수익률과 함께 append-only 원장에 남는다. 별도의 축소된 레인은 측정을
  앞당기지 않고 **측정 대상이 생기는 것을 막았다**: `run_c7ad46eea03840bf84ae7a8822ed02c3`에서
  잰 것 — `consensusRefs` 수집 절차가 없어 `variantViewCheck`가 0/4, 모든 후보가 강제로 대조군에
  떨어지고, USD 14,937.07 장부의 평면 1%가 **USD 149.37**로 USD 200 최소 티켓에 미달, 그래서 10개
  런 동안 단일종목 0건.
  이제 크기를 정하는 것은 **천장으로서의 Mandate**와 그 아래의 계산된 둘이다: 리스크 예산
  `(maxDrawdown − heldPortfolioHeat) / |stopLossPct|`, 그리고 후보 자신의 기대·하방 수익률 위에서
  도는 `targetWeight`의 quarter-Kelly 산식. ⛔ **20%는 기본값이 아니다** — 원본도 단일종목 캡은
  20%였고 실제 KOGAS 진입은 2.6%였다.
  `variantViewCheck`가 검사하는 것은 한 글자도 안 움직였고 **그 결과의 대가가 바뀌었다**:
  `variantView`를 담은 완전한 thesis, 출처와 날짜가 붙은 컨센서스 인용, 통과한 챌린지 — 이 중
  하나라도 없는 후보는 20배 작게 실리는 것이 아니라 **거절된다**
  (`variant_view_required_for_position` / `blocked`, `targetWeight`는 `null`). ⛔ 새 바가 아니다:
  넷 중 `challengeCleared`는 원래도 단독으로 치명적이었다.
  ⛔ `promotionGate`를 낮춘 것은 없고(이제 렌즈의 기록을 보고할 뿐 어떤 크기도 게이트하지 않는다)
  `controlArmLane.expansionProhibited`는 그대로다 — 대조군의 성과는 결코 사이징의 근거가 아니며,
  기계 코호트를 근거로 든 thesis는 `control_arm_evidence_cited` / `blocked`이다. 선언된 캡보다
  낮은 캡이 실제로 구속하는 자리에서는 `effectivePositionCap`이 그 비교를 계산해 `disclosures`에
  의무로 이름 대고, `proposalDisclosure`가 그것을 싣지 않은 제안을 거절한다
  (`position_cap_reduced_below_declared`). `concentration_cap_missing`과의 비대칭은 이것으로 닫힌다.
  ⚠️ **위험은 사라진 것이 아니라 이전됐다.** 성숙도 게이트가 없으므로 닫힌 결과 0건 상태에서 첫
  단일종목이 Mandate 상한까지 갈 수 있다. 남는 제동은 리스크 예산과 `portfolioHeat`을 통한
  `maxDrawdown` 0.06 · `cashFloor` 0.10 · 종목별 손절 · 집중도 전 축 · `newSinglePacing` · 그리고
  주문마다의 사람 승인이다.
  ([#226](https://github.com/untilled/aumos-catalogue/issues/226))
  ⚠️ **그리고 그 옆의 비대칭 — 빈 레인을 «방법론이 작동 중»으로 읽던 것 — 은 #212 ④부터 코드가
  아니라 카운트가 닫는다.** `executionRecord`가 호스트의 task run(`task_get`)과, 그 실행이
  `files_read`로 `scans/`에서 되읽은 recipe 답들을 읽어
  `dataPreparation` · `candidateEvaluation` · `eligibleCount`를 답하고,
  `mandateExecution`은 그 record에서 원인을 정하며 전에 교차하던 `gate-ran` 레인은 지워졌다.
  ⛔ 진단은 여전히 긍정적 답을 **철회**하고 더 이상 부여하지 않으며, 지운 것과 대체한 것의 짝은
  `README.md`가 든다.
  닫지 *못하는* 것은 대기 시간이다. `promotionGate`는 표본 30건, 클러스터 10개, **레짐 3개**를
  요구하고 앞의 둘만 후보 생성률에 반응한다 — 레짐은 달력이 지나야 바뀐다. 두 질문은 답하지 않고
  열린 채로 기록한다: 개별종목 레인들이 합쳐서 어디까지 갈 수 있는가, 그리고 1%와 완전 승격 사이에
  중간 등급을 둘 것인가.
  ([#151](https://github.com/untilled/aumos-catalogue/issues/151),
  [#153](https://github.com/untilled/aumos-catalogue/issues/153))
- **포지션은 규칙으로 닫히고, 그 규칙은 진입일을 읽는다.** 이식본의 시간 스톱 둘은 전부 조건부이고
  둘 다 실행이 써둬야 하는 `reviewBy`에 의존한다 — `exitCheck`의 `time_stop`(리뷰 날짜 도래 +
  진입가 미회복)과 `timeStopPolicy`(리뷰 날짜 도래 + 촉매 미실현 + 벤치마크 열위). 리뷰 날짜를
  아무도 써두지 않은 포지션은 둘 다에게 보이지 않고, 그래서 시간 스톱 연산 둘이 아무 문제도 보고하지
  않는 채로 장부의 **청산 표본이 0건**에 도달한다. `exitDiscipline`은 무조건이다 — 진입 후 40거래일이면
  성과와 무관하게 청산이고(`time_stop_reached`), 여럿이 겹치면 이쪽이 답한다. 이미 도래한 청산은
  연장할 리뷰가 아니다. ⚠️ **손절 폭이 이제 두 개인 것은 의도된 것이다.** 원본의 −8%는 1% 칸을 놓고
  계산된 값이고, 한 종목이 장부의 20%까지 실릴 수 있는 레인에서 같은 −8%는 한 포지션이 계좌 −1.6%를
  무는 것이다. 그래서 대조군을 제외한 모든 레인은 Mandate `maxDrawdown`을 그 포지션의 비중으로 나눠
  손절 폭을 역산하고, −8%는 그 답의 천장으로만 남는다. ⛔ 투자자는 `maxDrawdown`을 아직 선언하지
  않았으므로 대조군 밖의 오늘 답은 `hard_stop_unevaluated`이고 **숫자를 지어내지 않는다.** 산문으로
  두면 안 되는 부분은 등록이다 — `watchesToRegister`가 진입이 자기 제안에 복사해 넣을 `price-below`·
  `at-time` 행을 돌려주고, 그것 없는 진입은 `exit_rules_unregistered`, 도래한 스톱을 이 실행이 이행하지
  않으면 `exit_due_unactioned`이다. ⚠️ `standingPlans`가 `asOf`에 서 있던 무장을 이제 보여 주지만
  그것은 천장이 아니라 바닥이므로(시각을 댈 수 없는 약속은 추측하지 않고 빠진다), 규율은 여전히
  몇 주 전에 걸어둔 WATCH를 믿는 대신 매 실행 진입일에서 다시 계산된다. 그 읽기가 무엇을 정하고
  무엇을 정하지 못하는지는 `HOST-FOLLOWUPS.md`가 기록한다.
  ([#153](https://github.com/untilled/aumos-catalogue/issues/153))
- **단일종목 총합은 Mandate에서 파생되고, 투자자가 답할 질문이 담긴 상수는 더 이상 남지 않는다.**
  원본은 비코어 단일주를 28%로 묶었다. 그 값은 코어 ETF 목표 50%를 함께 들고 있던 배분의 한 조각이고,
  투자자가 ETF 레인을 이 계좌 밖으로 옮기기로 했으므로 **이식하지 않는다.** `singleNameBudget`이
  `cashFloor`가 남기는 범위를 계산하고 종목당은 `maxPositionWeight`가, 모양은 `concentration`이
  잡는다 — 펀드 설정 화면의 변경이 매니저를 움직이고, 미선언은 무제한이 아니라
  `single_name_budget_unevaluated`다. #133이 시작한 선의 종착점이며, `lib/constants.mjs`에 남은 값은
  전부 증거에 대한 주장이다.
  ([#153](https://github.com/untilled/aumos-catalogue/issues/153))
- **현금 하한은 투자자의 것이고, 이 패키지는 더 이상 그 사본을 갖지 않는다.**
  Mandate가 `cashFloor` 0.10을 선언한 동안 `coreDca.reserveFloorWeight`는 0.15를 들고 있었고
  패키지는 자기 숫자만 읽었다 — 한 축이 두 번 선언됐고, 포지션 상한과 달리 공시조차 없었다. 그
  설정은 사라졌고 `effectiveCashFloor`가 Mandate를 읽는다. 미선언은 "제한 없음"이 아니라
  `cash_floor_unevaluated`이고, 검사는 계획이 집행된 **뒤에** 남는 현금에 대해 돌며(그 산술이 없으면
  `cash_floor_projection_missing`, 어기면 `cash_floor_breach`), 이 방법론이 선언값보다 높은 하한을
  들게 되는 경우는 `field: 'cashFloor'` 행으로 `effectiveConstraints`에 공시된다 —
  `effectivePositionCap`이 `maxPositionWeight`에 대해 하는 것과 같은 공시다. ⚠️ 하한은 목표가
  아니다. 10%는 장부가 거기까지 *가도 된다*는 말이지 거기까지 채우라는 말이 아니다.
  ([#153](https://github.com/untilled/aumos-catalogue/issues/153))
- **벤더 최소 실행금액은 거절하지, 들어올리지 않는다.** `minimumExecutablePosition`은 그 시장에서
  낼 가치가 있는 가장 작은 주문 — 틱·랏·왕복 수수료 아래로는 측정할 결과가 남지 않는 금액 — 이고,
  `minimumExecutableWeight`가 그것을 이 장부의 비중으로 바꾼다. ⛔ #226 전에는 이 값이 실험 상한을
  **들어올렸다**. 들어올릴 상한이 이제 없으므로, 산식이 그 아래를 답한 비중은 그 최소치로
  올림되지 않고 `minimum_executable_not_met` / `blocked`이다 — 올리면 그 크기가 재는 것은 아이디어가
  아니라 반올림이다. 최소치가 구속하는 캡을 넘어서는 작은 장부에서는
  `minimum_executable_exceeds_cap`이 그것을 이름 대고 해소 NAV를 함께 싣는다. #149의
  `experimental_ladder_unreachable`이 더 좁고, 발화한 것 중 바깥이 답할 것이다.
  ⚠️ `policyLint` 방향도 뜻을 따라 뒤집혔다 — 최소치가 크면 더 많이 거절하므로 이제
  `higher-is-stricter`이고, 낮추는 것은 `policy_auto_relax`다. ⛔
  `experimental_floor_unreachable`·`experimental_floor_exceeds_cap`은 그것들이 재던 밴드와 레인
  칸과 함께 삭제됐다.
- 소스 벤더는 자기 응답 모양을 그대로 중계한다. 날짜와 신선도를 검사하는 것은 Aumos가 아니라 이
  매니저다.
- CLI web 관측은 replay 정본 Evidence가 아니다.
- 보정은 검토된 패키지/config 변경 없이 방법론을 승격하거나 다시 쓸 수 없다.
- 실제 증권사 연결 paper/shadow와 다중 실행 격리 검사는 설치된 Aumos 런타임과 자격증명을 요구하며
  이 카탈로그 저장소가 시뮬레이션하지 않는다.
