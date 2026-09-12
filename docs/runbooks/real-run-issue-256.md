# 실제 런 1회 런북 — `untilled/aumos-catalogue#256`의 마지막 한 칸

> **무엇을 닫는 문서인가.** `aumos-catalogue#256`의 남은 완료 조건 세 개 중 세 번째:
>
> > 자격증명이 있는 환경에서 세 패키지 중 하나로 실제 런 한 번: `decision_submit` → 승인 → 체결 → 다음 런의 WATCH 재arm까지. 이 저장소·CI에서는 할 수 없다.
>
> 그리고 `untilled/aumos#850`이 열다섯 차수 내내 ⬜로 남긴 한 줄 — *「실제 CLI 런을 한 번도 못 띄웠다(자격증명 없음)」* — 을 지우는 것이 이 런북의 전부다.
>
> ⛔ **이 문서의 4단계 이후는 진짜 돈을 쓴다.** 토스증권에는 시뮬레이터가 없다(§3).

---

## 0. 재려는 다섯 체크포인트

| # | 체크포인트 | 확인 지점 |
|---|---|---|
| ① | 카탈로그 패키지가 설치된다 | `<AUMOS_HOME>/managers/<agt_…>/aumos.json`, `runnable-managers` |
| ② | 런이 `decision_submit`을 내고 판단이 봉인된다 | `<AUMOS_HOME>/runs/<run_…>/decision.json` → `decisions` 행 + 승인 대기열 |
| ③ | 승인(+ 담당 지정 체크) → 주문 → 체결이 기록된다 | `approvals`·`orders`·`position_assignments` 행 |
| ④ | 다음 런이 그 포지션을 **자기 것**으로 읽고 WATCH/리뷰를 다시 arm한다 | `portfolio_get`의 `assignment.managerInstanceId` == 자기 `context_get` id; `plans` 질의 |
| ⑤ | Forward Track Record가 그 판단을 건다 | `performance` 질의의 `runs[].decisionId` |

⚠️ **⑤의 뜻 — `untilled/aumos#899`(2026-09-12 머지) 이후.** 「체결 → Forward Track Record」 연결이 **이제 있다**: `track-record`가 order/fill을 입력으로 받고, 판단마다 실현·평가·전방 세 층을 따로 기록하며(⛔ 합산 필드 없음), 관측된 수수료·제세금을 주문 행에 싣고, 벤치마크는 통화별(KRW 069500 · USD SPY)로 판단 자체의 보유 창에서 잰다. 한 번의 런으로 볼 것은 `decisionRecords[].window.opened == "fill"`(체결이 실적에 닿았다는 증거)과 `costs.fees.status`(**`data_missing`이어야지 `0`이면 결함** — 마이그레이션이 백필도 기본값도 두지 않았다)이다. 다섯 축(reliability/discipline/coherence/acuity/composure)은 여전히 `insufficient`로 나온다(최소치: 런 5, 판단 5, 해소된 판단 10). **그것이 정상이고, 그대로 기록하는 것이 이 체크포인트다.**

---

## 1. 패키지 선택 — `shareholder-rerating`

셋 중 **shareholder-rerating (SR, 0.6.0)** 을 쓴다. 근거 넷:

1. **종목이 망가져 있을 것을 요구하지 않는 유일한 패키지다.**
   - FMR은 Stage 2 발굴 게이트가 **설정 불가로 박혀 있다**: `drawdown = close/max(high, 최근 252봉) − 1 ≤ −0.30` **그리고** (`rsi14 ≤ 35` 또는 `ma200Distance ≤ −0.15`). 건강한 대형주는 `uptrend-pullback-not-this-strategy`로 끝난다.
   - CT는 *훼손된* 회사 + **날짜가 박힌 촉매 원본**을 요구한다.
   - SR은 반대를 원한다 — *「환원을 집행하며 주가가 오르는 좋은 회사야말로 찾는 대상」*.
2. **외부 입력이 가장 적다.** SR의 BUY는 **OpenDART 공시 한 계열 + 가격 한 번**이면 닫힌다(배당 결의, 자기주식 취득/소각 보고, 분기·사업보고서). CT는 관보/규제기관 고시 + **지표 2채널 × 각 2개 기간의 관측** + 실적 발표 일정까지 5~6개. FMR은 **조정기준이 선언된 250봉 이상**을 요구하고, 그 조건이 자기 참고사례(NAVER)조차 `replay 부적합`으로 만들었다.
3. **시점 게이트가 없다.** FMR은 `stabilisation === "confirmed"`(저점 이후 15봉·+5%·RSI≥35)를, CT는 `catalystHorizonDays 180` 안의 창과 `minImprovingChannels 2`를 추가로 통과해야 한다. SR의 대응물은 `executionPaceFloor 0.5` + `executionObservableElapsed 0.25` 하나뿐이고, **진행 중인 자사주 매입 프로그램이면 이미 만족한다.**
4. **fixture가 BUY를 4건 든다.** `fixtures/cases.json`의 `financial-positive-reaches-buy`(주석이 *「이 패키지가 존재하는 이유인 케이스」*라 적는다)와 `a-cap-binds-the-total-…`, `fixtures/boundaries.json` 2건. FMR은 2건(같은 합성 시리즈), CT의 양성 케이스는 `intent: "enter-staged"`이고 같은 파일에 *「분류가 곧 BUY가 아니다」*를 고정하는 쌍둥이 케이스가 있다.

**덤:** SR만 스케줄이 둘이라(`30 16 * * 1-5` + `0 8 1 * *`, `Asia/Seoul`) 월간 기회가 더 많다.

**겨눌 대상:** 은행 또는 은행계 금융지주, 혹은 비금융 사업회사. ⛔ **보험사·증권사·복합기업은 피한다** — SR은 이들을 분류한 뒤 판정이 아니라 명시적 **「미평가」**로 되돌린다.

---

## 2. 사전 준비

### 2.1 도구·버전

| | 값 | 확인 |
|---|---|---|
| macOS | Apple Silicon/Intel 무관, **로그인 키체인이 열려 있어야** 한다 | — |
| Node | `>=22` (`package.json` `engines`) | `node -v` |
| pnpm | `11.0.8` (`packageManager`) | `pnpm -v` |
| 호스트 버전 | `0.5.0` — 세 패키지 전부 `engines.aumos: ">=0.5.0"` | `packages/manager-runtime/src/install.ts`의 `AUMOS_APP_VERSION` |
| `claude` CLI | **`>=2.1.221 <3.0.0`** — 강제된다 | `claude --version` |
| `claude` 로그인 | 구독 로그인이 되어 있어야 한다 | `claude auth status` → `{"loggedIn":true,…}` |

버전 핀은 `packages/cli-driver/src/vendors.ts:618`의 `pin: { min: '2.1.221', belowMajor: 3 }`이고 `detect.ts:73`의 `satisfiesPin`이 실제로 막는다(`unsupported-version`). 호스트에게 직접 묻는 것이 가장 확실하다:

```bash
echo '{"id":1,"command":{"kind":"vendors","refresh":true}}' | $HOST
```
`refresh: true`가 `claude --version`과 `claude auth status`를 다시 돌린다.

CLI 경로가 안 잡히면 (Finder에서 띄운 앱은 `~/.local/bin`이 PATH에 없다):
```bash
export AUMOS_CLAUDE_BIN=/Users/<you>/.local/bin/claude     # 이것이 언제나 먼저 이긴다
# 또는 호스트에게 시킨다 (~/.aumos-256/ui.json의 vendorPaths에 저장된다)
echo '{"id":1,"command":{"kind":"set-vendor-path","vendor":"claude","path":"/Users/<you>/.local/bin/claude"}}' | $HOST
```

⚠️ **로그인이 안 되어 있어도 런은 시작된다.** #306 이후 사전 거절이 없어졌다 — 런이 열리고 `claude`의 TUI가 런 터미널 안에 `Not logged in · Run /login`을 그린다. `run-input`으로 그 안에 `/login`을 타이핑할 수 있고, 아무도 안 치면 유휴 감시가 판단 없이 `awaiting-input`으로 끝낸다.

⚠️ **Aumos는 모델 API 키를 갖지 않는다.** 자식에게 넘기는 환경변수는 **허용목록**이다 (`packages/cli-driver/src/isolation.ts`):
```
ENV_PASSTHROUGH = ['PATH','USER','LOGNAME','LANG','LC_ALL','TZ','TERM']
+ HOME, TERM, AUMOS_MANAGER_PACKAGE, AUMOS_MANAGER_STORE, AUMOS_AS_OF
```
`ANTHROPIC_API_KEY`는 **넘어가지 않는다**(테스트가 단언한다). 인증은 오직 구독 로그인이고, `HOME`·`USER`가 그 유일한 통로다 — `USER`가 없으면 macOS에서 키체인 자격증명에 닿지 못해 모든 런이 「Not logged in」으로 끝난다.

### 2.2 자격증명 — 이름만 적는다. 값은 이 문서에 절대 쓰지 않는다

| 이름 | 어디서 | 어디에 둘 것인가 |
|---|---|---|
| `TOSS_CLIENT_ID` | 토스증권 앱 → **설정 → Open API**. 발급 시 **호출 IP를 등록**해야 한다 | ⛔ 키체인에 저장하지 말 것. **이 셸에만 export** |
| `TOSS_CLIENT_SECRET` | 위와 함께 발급, **한 번만 보여 준다** | 같음 |
| OpenDART `api-key` | `opendart.fss.or.kr` 등록(무료·자동승인) | `save-source-credential`로 키체인 |
| `claude` 구독 로그인 | 이미 로그인된 CLI | Aumos는 LLM 키를 갖지 않는다 |

**토스 쌍을 키체인에 넣지 않는 이유** (`services/kernel-host/README.md` §"The live round trip"): 매니저는 셸을 갖고, `security find-generic-password`로 키체인을 읽을 수 있다. export만 하면 그 질문이 아예 안 열린다. SETTINGS는 그 로그인을 `from-environment`로 표시하며 **그것이 정상이다**(#180 설계).

```bash
# 이 셸에서만. 히스토리에 남기기 싫으면 앞에 공백 하나.
 export TOSS_CLIENT_ID='…'
 export TOSS_CLIENT_SECRET='…'
```

`m8c-live.mjs`를 쓸 거라면 저장소 루트의 `.m8c-credentials.json`(gitignore 되어 있고 **`chmod 600` 필수**):
```json
{ "TOSS_CLIENT_ID": "…", "TOSS_CLIENT_SECRET": "…" }
```
⚠️ **끝나면 지운다.** 디스크의 평문 비밀이고, 매니저가 읽을 수 있다.

### 2.3 계좌

- **본인 명의 위탁계좌**여야 한다(가족 명의 불가).
- **국내 주식만 든 계좌**를 쓴다. 한 토스 계좌가 국내·미국 주식을 같이 들면 벤더가 합산해 주지 않고 `brokerBook`이 `position-currency-mismatch`로 **정확히 거절한다**.
- 잔고: **₩300,000 ~ ₩2,000,000** 권장(§7에서 사이징 계산).

---

## 3. ⛔ 안전 — 먼저 읽는다

1. **토스는 live 하나뿐이다.** `packages/credentials/src/catalog.ts`:
   ```
   environments: ['live']
   ```
   > *Toss publishes a single server (`openapi.tossinvest.com`) and no sandbox. The 모의투자 in the Toss app is a separate product with no API behind it.*

   `judgeConnection`이 `toss` + `paper`를 **이름으로 거절한다.** 그 거절을 한 번 보는 것은 값어치가 있다.
   - 페이퍼가 필요하면 Alpaca(`environments: ['paper','live']`)뿐인데 **미국 시장이라 XKRX 패키지 셋 중 어느 것도 쓸 수 없다.** 이 런북에 페이퍼 경로는 없다.
2. **Aumos는 주문을 취소하지 못한다.** `toss-execution.ts`의 `cancelOrder`는 **던진다**:
   > *this broker cancels by its own order id, and `${clientOrderId}` is ours — nothing in Aumos cancels an order yet*

   **취소는 토스증권 앱에서 직접 한다.** 이것이 유일한 취소 경로다.
3. **`timeInForce`는 `day`만 나간다.** 그 외는 `tossTimeInForce`가 거절한다 — *「이 브로커에는 그 주문이 없다」*. 장 마감 뒤 승인하면 주문은 그날 안에 죽는다.
4. **호가 단위(틱)는 포트를 안 건넌다.** 지정가가 틱에서 어긋나면 **거래소가 올바른 틱을 에러 본문에 실어 거절**하고 `toss-http.ts`가 그것을 그대로 올려 준다. 이것이 설계다.
5. **수량은 정수로 잘린다.** 토스는 `fractionable: false`이므로 `roundQuantity`가 `Math.trunc`한다 — 목표 비중이 1주에 못 미치면 **0주**가 되고 그 다리는 조용히 빠진다(#849가 여는 결함의 이웃).
6. **⚠️ `minNotionalMinorUnits`(더스트 하한)는 선언만 있고 배선이 없다.** `planner.ts` 밖 어디에도 생산자가 없다 → §9 ⚠️-2.
7. **`AUMOS_HOME`을 반드시 명시한다.** 생략하면 이 기기의 진짜 저장소를 겨눈다. `chmod 700` 필수.
8. **끝나면 되판다**(§8) — 포지션이 연습보다 오래 살지 않게.

---

## 4. 저장소 준비 · 전용 `AUMOS_HOME`

```bash
cd ~/workspace/personal/aumos
git pull
pnpm install
pnpm build                       # ⚠️ 필수. dist/가 없으면 아래 전부 동작하지 않는다

# 카탈로그 체크아웃도 최신으로(로컬 경로 설치를 쓸 경우)
cd ~/workspace/personal/aumos-catalogue && git pull && cd -
```

전용 저장소를 판다. ⛔ 앱이 쓰는 `~/.aumos`도, 벤치의 `~/.aumos-bench`도 아니다.

```bash
export AUMOS_HOME="$HOME/.aumos-256"
mkdir -p "$AUMOS_HOME" && chmod 700 "$AUMOS_HOME"

# 셸 편의
HOST="node $PWD/services/kernel-host/dist/main.js"
ask() { { echo "$1"; sleep "${2:-10}"; } | node "$PWD/services/kernel-host/dist/main.js"; }
```

> **커맨드는 비동기로 답한다.** 맨 `echo … |`는 답이 오기 전에 stdin을 닫는다. 위 `ask`처럼 `sleep`을 붙인다. 읽기 질의(`{"query":…}`)는 즉답이라 `echo` 하나로 충분하다.

**⚠️ 시드는 하지 않는다.** 빈 `AUMOS_HOME`에 `apply-setting`을 보내면 워커가 가는 길에 저장소를 만든다. `seed`는 데모용이고 **이 기기의 기본 저장소를 겨누면 `seedRefusal`이 거절한다**.

### 확인
```bash
ls -la "$AUMOS_HOME"                      # 아직 비어 있음
echo '{"id":1,"command":{"kind":"vendors"}}' | $HOST     # claude가 path와 함께 보여야 한다
```
`vendors` 답에 `claude`가 경로와 함께 없으면 §2.1의 `set-vendor-path`로 돌아간다.

---

## 5. 토스 로그인 · 펀드 · 계좌 붙이기

두 길이 있다. **A가 짧고 실수가 적다.**

### A. `m8c-live.mjs` (권장)

```bash
node services/kernel-host/scripts/m8c-live.mjs check
node services/kernel-host/scripts/m8c-live.mjs connect  "Toss 위탁"
node services/kernel-host/scripts/m8c-live.mjs accounts        # accountRef를 받아 적는다
node services/kernel-host/scripts/m8c-live.mjs book "#256" <accountRef>
node services/kernel-host/scripts/m8c-live.mjs read
```

- `accountRef`는 **벤더의 `accountSeq`**이지 명세서에 찍힌 계좌번호가 아니다.
- `read`가 초록이려면 `book.provenance.source === "broker"` **그리고** `snapshotRefreshed === true`여야 한다. 스크립트가 그 둘을 실제로 검사하고, 아니면 이유를 찍고 종료 1로 죽는다.
- **15분 창**: 엔진은 방금 마크한 장부를 15분 동안 내버려 둔다. 재실행이 *이전* 마크를 보여 주는 것이 정상이다. 급하면 `AUMOS_SNAPSHOT_MAX_AGE_MS=0`(`auto`가 스스로 설정한다).

`auto` 하나로 전부:
```bash
node services/kernel-host/scripts/m8c-live.mjs auto "#256"
```
⛔ `auto`도 **주문은 절대 내지 않는다.** 마지막 단계는 사람이 타이핑하도록 인쇄만 한다.

### B. 와이어 그대로

```bash
# 1) 로그인. paper는 이름으로 거절된다 — 한 번 봐 두면 좋다.
ask '{"id":1,"command":{"kind":"apply-setting","setting":{"kind":"open-connection","connector":"toss","environment":"live","label":"Toss 위탁"}}}' 15

# 2) 이 로그인이 보는 계좌. 벤더에 닿고 아무것도 쓰지 않는다.
ask '{"id":1,"command":{"kind":"broker-accounts"}}' 30

# 3) 맨데이트 + 펀드
ask '{"id":1,"command":{"kind":"apply-setting","setting":{"kind":"open-mandate","draft":{
  "label":"#256",
  "objective":"카탈로그 매니저 실런 1회. 국내 은행계 금융지주 중 주주환원 프로그램 집행이 확인되는 1종목. 소액.",
  "horizonDays":3650,
  "constraints":{"baseCurrency":"KRW","allowedAssetClasses":["equity","cash"],
    "maxPositionWeight":0.2,"cashFloor":0.05,"maxDrawdown":0.5,
    "allowShorting":false,"allowLeverage":false,"excludedSymbols":[]}}}}}' 20
# → mandateId

ask '{"id":1,"command":{"kind":"apply-setting","setting":{"kind":"open-portfolio","label":"#256","mandateId":"mnd_…","baseCurrency":"KRW","cash":{"currency":"KRW","minorUnits":0},"positions":[]}}}' 20
echo '{"id":1,"query":{"kind":"portfolios"}}' | $HOST     # → portfolioId (pf_…)
echo '{"id":1,"query":{"kind":"settings"}}'   | $HOST     # → connectionId (conn_…)

# 4) 계좌 붙이기
ask '{"id":1,"command":{"kind":"apply-setting","setting":{"kind":"attach-account","portfolioId":"pf_…","connectionId":"conn_…","accountRef":"<accountSeq>","baseCurrency":"KRW"}}}' 20

# 5) 진짜 계좌를 장부로 읽는다
{ echo '{"id":1,"command":{"kind":"wake-tick"}}'; sleep 8; echo '{"id":1,"command":{"kind":"wake-status"}}'; sleep 5; echo '{"id":1,"query":{"kind":"portfolio"}}'; sleep 5; } | $HOST
```

> `wake-tick`·`wake-status`·`portfolio`를 **한 stdin에서** 물어야 한다. 실패한 브로커 읽기의 진단(`brokerProblems`)은 엔진 프로세스의 클로저 변수라, 일회성 `echo | node`는 그것을 프로세스와 함께 버린다.

### ✅ 확인
```
book.provenance.source == "broker"
book.totalValue        == 실제 계좌 평가액
wake-status.brokerProblems == []
```
`brokerProblems`에 401이 있으면 **호출 IP가 미등록**인 경우가 대부분이다.

---

## 6. `open-dart` 소스 설치 · 패키지 설치 (체크포인트 ①)

### 6.1 킬 리스트를 한 번 채운다 — 이것을 건너뛰면 설치가 막힌다

```bash
ask '{"id":1,"command":{"kind":"catalogue"}}' 20
```
`catalogue`가 `killList.refresh()`를 돈다. **한 번도 받은 적이 없으면 `previewInstall`이 `never-checked`를 blocking으로 올리고 설치가 거절된다.**

```bash
ls -l "$AUMOS_HOME/kill-list.json"        # 있어야 한다
```

### 6.2 OpenDART 소스

```bash
ask '{"id":1,"command":{"kind":"source-catalogue"}}' 20
ask '{"id":1,"command":{"kind":"install-source","sourceId":"open-dart","version":"0.1.0","portfolioId":"pf_…"}}' 20
ask '{"id":1,"command":{"kind":"save-source-credential","sourceId":"open-dart","name":"api-key","value":"<OpenDART 키>"}}' 10
```

- ⚠️ **`portfolioId`를 빼면 바이트만 내려오고 어떤 펀드도 그것을 부를 수 없다.**
- 자격증명 이름은 정확히 `api-key`다(`sources/open-dart/source.json`의 `credentials[0].name`). `crtfc_key` 쿼리 파라미터로 주입되며 매니저에게는 절대 보이지 않는다.
- 되읽는 커맨드는 없다.

```bash
ls -d "$AUMOS_HOME/sources/open-dart@0.1.0"     # 확인
```

### 6.3 SR 내려받기 + 설치

```bash
ask '{"id":1,"command":{"kind":"registry-fetch","packageId":"shareholder-rerating","version":"0.5.7"}}' 30
ls -d "$AUMOS_HOME/staging/shareholder-rerating@0.5.7"
```

> ⚠️ `CLAUDE.md`와 `services/kernel-host/README.md`는 아직 `~/.aumos/managers/<id>@<version>/`라 적지만 **코드는 `<AUMOS_HOME>/staging/<id>@<version>/`에 쓴다.** `managers/`는 이제 **인스턴스 id**로 키가 잡힌다.
> ⚠️ staging은 호스트가 열릴 때 **쓸린다**(1시간 TTL). 받았으면 바로 설치한다.

설치 — 이것이 §37 동의이자 바이트를 인스턴스 밑으로 옮기는 행위다:

```bash
ask '{"id":1,"command":{"kind":"apply-setting","setting":{"kind":"install-manager",
  "packagePath":"'"$AUMOS_HOME"'/staging/shareholder-rerating@0.5.7",
  "portfolioId":"pf_…",
  "vendor":"claude",
  "acknowledged":true,
  "config":{"minimumExecutableWeight":0.004,"maxActiveTheses":1}}}}' 30
```

- `acknowledged: true`는 **비차단 경고만** 통과시킨다(`source-not-installed`, `connection-not-linked`, `stale-kill-list`, `warned`). 차단 문제를 뚫는 플래그는 **없다**.
- `mode`는 기본 **`live`**다 — `setup.ts`가 *"The default is LIVE because an investor installing a manager on their book means this book's manager"*라 적고 대안은 `disabled`다(#479 이후. `services/kernel-host/README.md:1020`의 「SHADOW가 기본」은 **낡았다**).
  ⚠️ **그래도 눈으로 확인한다** — SHADOW 인스턴스는 제 그림자 장부에서 돌아 승인 대기열에 서지 않고, 그러면 체크포인트 ③이 통째로 실패한다:
  ```bash
  echo '{"id":1,"command":{"kind":"runnable-managers"}}' | $HOST     # mode == "live" 확인
  # 아니면
  ask '{"id":1,"command":{"kind":"apply-setting","setting":{"kind":"set-instance-mode","instanceId":"agt_…","mode":"live"}}}' 15
  ```
- `model`을 생략하면 CLI의 기본 모델이다 — 그것이 세 번째 값이고 기본값이 아니다.
- `minimumExecutableWeight: 0.004`가 왜 필요한지는 §7.2.
- **로컬 체크아웃에서 설치하고 싶다면** `packagePath`를 `~/workspace/personal/aumos-catalogue/managers/shareholder-rerating`로 주면 된다(디렉토리는 복사되지, 옮겨지지 않는다). 다만 그것은 *게시된 바이트로 설치했다*는 주장을 약화시키므로 **#256을 닫는 런은 `registry-fetch` 경로를 쓴다.**

### ✅ 체크포인트 ①
```bash
echo '{"id":1,"command":{"kind":"runnable-managers"}}' | $HOST     # shareholder-rerating 행 + agt_… 
ls "$AUMOS_HOME/managers/"                                          # agt_… 디렉토리
cat "$AUMOS_HOME/managers/agt_…/aumos.json" | head -5                # version 0.5.7
```

---

## 7. 런 — `decision_submit` (체크포인트 ②)

### 7.1 언제 돌릴 것인가

- SR의 스케줄은 `30 16 * * 1-5`(장 마감 후) + `0 8 1 * *` (Asia/Seoul). 기다릴 필요 없이 **수동으로 띄운다.**
- 다만 **주문이 당일 체결되려면 KRX 정규장(09:00–15:30 KST) 안에서 승인**해야 한다(`timeInForce: day`). 그래서 **평일 오전에 런을 띄우고 오전 중에 승인**하는 것이 이 연습의 창이다.

### 7.2 사이징 — 왜 `minimumExecutableWeight`를 넣었나

SR의 목표 비중은 `riskBudgetWeight / (무효화 가격까지의 거리)`다. `riskBudgetWeight` 기본 0.01이고 **max도 0.01이라 키울 수 없다**(narrow-only). 무효화 거리 25%면 목표 비중 ≈ 4%.

그런데 기본 `minimumExecutablePosition: 500000` KRW는 **₩2,000,000 장부에서 0.25 비중의 하한**이 된다 — 4% 목표가 그 하한에 걸려 **거절**된다. `minimumExecutableWeight`는 **통화를 안 보고 outright 이긴다**(스키마가 그렇게 적는다). `0.004`는 스키마 자신의 `examples` 값이다.

| 장부 | 목표 4% | 주당 ₩18,000 기준 |
|---|---|---|
| ₩500,000 | ₩20,000 | 1주 |
| ₩1,000,000 | ₩40,000 | 2주 |
| ₩2,000,000 | ₩80,000 | 4주 |

⚠️ **1주 미만이면 `roundQuantity`가 0으로 자르고 그 다리는 사라진다.** ₩500,000 미만 장부는 권하지 않는다.

### 7.3 띄운다

```bash
ask '{"id":1,"command":{"kind":"start-run","packageId":"shareholder-rerating","managerInstanceId":"agt_…","live":true}}' 600
```

> ⛔ **`"live": true`가 없으면 픽스처 세계로 돈다.** `worker.ts:1291`이 `fixtures: request.live !== true`이고, 자격증명은 `live: true`인 런에만 실린다. **이 한 줄이 이 런북 전체의 요점이다.**
> ⚠️ 수동 `start-run`의 task는 **`PORTFOLIO_REVIEW`**다(#517). `ASSET_REVIEW`로 특정 종목을 지목하는 인자는 `start-run`에 **없다** → §9 ⚠️-3.

⚠️ **`start-run`의 답은 `runId`가 아니라 티켓이다** — `{started:true, ticket:"tkt_…"}`. 그 티켓으로 따라간다(같은 stdin 안에서):
```bash
{ echo '{"id":1,"command":{"kind":"start-run","packageId":"shareholder-rerating","managerInstanceId":"agt_…","live":true}}'
  sleep 5
  echo '{"id":2,"command":{"kind":"run-terminal","ticket":"tkt_1","since":0}}'
  sleep 600
} | $HOST
```
그 밖에 `run-progress`, `run-transcript`, `run-input`(터미널에 타이핑 — 로그인이 필요할 때 `/login`을 여기로 보낸다)가 같은 티켓을 받는다.

### 알림 — NDJSON 파이프에 `id` 없는 줄로 온다

`{"notification":{…}}` 형태. 이 런북이 기다리는 것들:

| `kind` | 뜻 |
|---|---|
| `run-started` | `Manager started · {manager}` |
| `run-attention` | `Waiting for you · {manager}` — 세션이 뭔가를 묻고 있다(로그인일 가능성이 높다) |
| `run-settled` | `Run finished · {manager}` / `{action} — {conclusion}` |
| **`approval-pending`** | `Waiting for your approval · {book}` — **체크포인트 ②의 신호** (key: `approval:<decisionId>`) |
| **`order-settled`** | `{state} · {book}` / `{side} {quantity} {symbol} at {price}` — **체크포인트 ③의 신호**. `filled`·`partially-filled`·`cancelled`·`expired`·`rejected`에만 온다 |

⛔ 주문이 `pending`/`accepted`로 접수된 것에는 **알림이 없다**(의도된 침묵).

### stderr 로그 줄 (stdout은 프로토콜 전용이다)

```
[aumos-kernel-host] reading <path>            # 호스트가 열렸다
[aumos-kernel-host] PATH += /Users/…/.local/bin
[aumos-wake] ticking every 60000ms · market source <src>
[aumos-run-worker] …                          # 워커 stderr 전달
[aumos-mcp] {"event":"tool_call","tool":"portfolio_read","outcome":"allowed",…}
[aumos-mcp] {"event":"tool_call","tool":"decision_submit",…}   ← 체크포인트 ②
```

### 7.4 무엇을 볼 것인가 — 디스크

```bash
RUN=$(ls -t "$AUMOS_HOME/runs" | head -1); echo "$RUN"
ls -la "$AUMOS_HOME/runs/$RUN"
```

| 파일 | 뜻 |
|---|---|
| `invocation.json` | 매니저가 받은 것 전부 — `mandate.objective`, `portfolio`, `asOf`, `config` |
| `decision.json` | **`decision_submit`이 쓴 바로 그 파일.** 있으면 체크포인트 ② 전반부 성립 |
| `evidence.jsonl` | 게이트웨이가 기록한 근거 |
| `mcp-audit.jsonl` | 매니저가 부른 툴 전부 — `source_request`(OpenDART), `connection_request`(토스 시세)가 여기 찍힌다 |
| `served-tools.json` | 게이트웨이가 **실제로 세운** 툴 이름. 없으면 `unobservable`이지 *「빠진 게 없다」*가 아니다 |
| `source-gaps.json` | 게이트웨이가 **못 세운** 소스 문서. `open-dart`가 여기 있으면 §6.2가 덜 된 것이다 |
| `status.jsonl` | 훅이 찍는 세션 진행 |
| `unsealed.json` | **런이 봉인 없이 죽었을 때만** 생긴다(#594) — 있으면 그 자체가 진단이다 |

⚠️ **`claude`의 대화 기록(transcript)은 런 디렉토리에 없다.** `~/.claude/projects/<enc>/<uuid>/`에 남고 이 빌드는 일부러 읽지 않는다. 런 디렉토리가 지워진 뒤에도 `claude --resume <uuid>`로 그 대화를 다시 열 수 있다.

⚠️ **보존**: `sweep.ts`의 `RUN_DIRECTORY_TTL_MS = 14일`, 그리고 **봉인된 런만 쓸린다** — `no-proposal`·`failed`·`timeout`·`rejected` 디렉토리는 무기한 남는다.

```bash
cat "$AUMOS_HOME/runs/$RUN/source-gaps.json"      # [] 여야 한다
jq -r '.decision.action' "$AUMOS_HOME/runs/$RUN/decision.json"
```

### 7.5 무엇을 볼 것인가 — 저장소

```bash
echo '{"id":1,"query":{"kind":"approvals"}}' | $HOST      # pending[]에 dec_… 이 서야 한다
echo '{"id":1,"query":{"kind":"today"}}'     | $HOST
```

### ✅ 체크포인트 ②
- `runs/<run_…>/decision.json` 존재 **그리고**
- `approvals` 질의의 `pending[]`에 그 판단이 `decisionId: dec_…`로 서 있다.

판단이 `WAIT`/`WATCH`면 **주문이 안 나가므로 승인 대기열에 서지 않는다** — §8로 간다.

---

## 8. 판단이 WATCH/WAIT로 끝났다면 — 패키지를 고치지 않고 창을 좁히는 법

⛔ **`PROMPT.md`도 `lib/*.mjs`도 `thresholds.mjs`도 건드리지 않는다.** 그러면 재는 대상이 바뀐다. 아래는 전부 **호스트가 제공하는 손잡이**다.

순서대로 시도한다.

**① 맨데이트 `objective`로 겨눈다 (가장 강한 손잡이).**
`MandateDraft.objective`는 AMP 스냅샷(`packages/amp/src/snapshots.ts`)에 실려 매니저에게 **그대로 도착한다.** SR §0이 맨 먼저 읽는다. 종목명을 직접 쓰는 것은 과하지만, **섹터와 요건을 좁히는 것은 정당하다**:
```
"국내 은행계 금융지주 중, 공시된 자기주식 취득 프로그램이 집행 중(취득결과보고서가 이미 제출됨)인 1종목."
```
바꾸려면 새 맨데이트를 열고 펀드를 그쪽으로 — 또는 새 `#256-2` 펀드를 파는 편이 깨끗하다.

**② 실패 이유를 먼저 읽는다.** `decision.json`의 `outcomeCode`가 전부를 말한다.

| `outcomeCode` | 뜻 | 손잡이 |
|---|---|---|
| `data_missing` | OpenDART/시세가 안 닿았다 | `source-gaps.json`·`mcp-audit.jsonl` 확인 → §6.2 재점검 |
| `research_incomplete` | 열 개 필수 출력 중 하나가 빔(`contraryEvidence`가 비면 런이 진다; `invalidationPrice ≤ 0`도 여기) | 재실행. 다른 후보로 갈 여지를 `objective`로 연다 |
| `risk_limit_exceeded` | 맨데이트가 잘랐다 | `maxPositionWeight`를 0.2 → 0.3, `cashFloor`를 0.05로 |
| 사이즈가 하한에 걸림 | `minimumExecutable*` | `minimumExecutableWeight`를 더 낮춘다(아래) |

**③ 인스턴스 config를 조인다.** 패키지가 아니라 **설치본의 설정**이다:
```bash
ask '{"id":1,"command":{"kind":"apply-setting","setting":{"kind":"set-instance-config","instanceId":"agt_…","config":{"minimumExecutableWeight":0.002,"maxActiveTheses":1,"deepReviewIntervalDays":7}}}}' 15
```
⚠️ **문서 전체를 보낸다.** 빈 문서는 「한 번도 설정되지 않음」으로 되돌린다.
⛔ `riskBudgetWeight`는 **키울 수 없다**(max 0.01, narrow-only). 사이즈를 키우고 싶으면 **장부에 현금을 더 넣는 쪽**이 유일한 길이다.

**④ 장부를 키운다.** 목표 비중이 1주로 반올림되지 않는 것이 흔한 실패다. 계좌에 현금을 더 넣고 `wake-tick`으로 다시 마크한다.

**⑤ 대화를 이어 다시 판단시킨다.** 같은 세션을 잇는 **새 런**이다:
```bash
ask '{"id":1,"command":{"kind":"start-run","packageId":"shareholder-rerating","resumeRunId":"run_…","live":true}}' 600
```

**⑥ 그래도 WATCH면 그것을 기록한다.** SR은 자사주 프로그램 집행이 확인되지 않는 날에는 WATCH가 **옳은 답**이다. #256이 스스로 적은 규율 — *「모든 사례가 대기로 끝나는 구현을 성공으로 처리하지 않는다」* — 의 반대편은 *「BUY가 나오도록 만들지 않는다」*(#298)다. **BUY를 만들어 내는 대신 날을 바꿔 다시 돌린다.** 배당 결의(2~3월)와 자사주 취득결과보고 직후가 확률이 가장 높다.

⚠️ 페이퍼/샌드박스 펀드로 피해 가는 길은 **없다**(§3.1). 브로커가 안 붙은 펀드에서는 `AUMOS_BROKER_CHANNEL`이 안 서서 `market_quote`·`connection_request` 자체가 세워지지 않고, 가격 없이는 SR이 사이징을 못 해 `data_missing`으로 끝난다.

---

## 9-A. 승인 · 담당 지정 · 체결 (체크포인트 ③)

### 9-A.1 미리보기 — 나갈 것 전부를, 나가기 전에

```bash
ask '{"id":1,"command":{"kind":"approval-preview","decisionId":"dec_…"}}' 20
```
가격을 위해 **네트워크에 닿고** 계획을 한 번 더 유도한다. 답에서 볼 것:

| 필드 | 봐야 할 것 |
|---|---|
| `plan.orders[]` | `symbol`·`side: "buy"`·`quantity`(정수)·`estimatedPrice` |
| `accounts[]` | `accountRef` + `environment: "live"` ← **live임을 눈으로 확인** |
| `blocked` | `null`이어야 한다. 아니면 로그인/키 문제 |
| `assignments[]` | **여기가 #785다.** 각 행: `assetKey`·`symbol`·`version`·`state`·`holder`·`candidate` |

`assignments[0]`은 보통:
```json
{ "assetKey":"equity:XKRX:316140", "symbol":"316140", "version":0,
  "state":"none", "holder":null, "candidate":{"instanceId":"agt_…","label":"Shareholder Rerating"} }
```
`holder: null`은 **「미귀속」**이지 「아직 안 읽었다」가 아니다.

### 9-A.2 앱에서 승인할 때 (권장 — #785의 체크박스를 실제로 누르는 경로)

```bash
# 창 있는 앱
cd apps/desktop && pnpm bundle:runtime     # 새 클론이면 한 번만
AUMOS_HOME="$HOME/.aumos-256" pnpm app:desktop
# 또는 브라우저로
AUMOS_HOME="$HOME/.aumos-256" pnpm app
```
⚠️ **`pnpm app`/`pnpm app:desktop`은 `AUMOS_HOME`을 `~/.aumos-dev/worktrees/<worktree>`로 덮어쓴다.** 위처럼 **명시적으로 주면 그쪽이 이긴다.**

화면에서:
1. 사이드바 **「승인」**(`nav.approvals`) → `apps/desktop/src/screens/Approvals.tsx`
2. 대기 행을 펼치고 **「리스크 점검」**과 주문 목록을 읽는다
3. **「운용 담당」**(`approvals.assign`) 절의 체크박스를 켠다 —
   > **「Shareholder Rerating을(를) 이 포지션의 운용 담당으로 지정합니다. 주문만 승인해서는 지정되지 않습니다.」**

   ⛔ **기본값은 꺼짐이다**(`useState(false)`, 설계). **켜지 않으면 담당이 한 글자도 안 움직이고 체크포인트 ④가 실패한다.**
   그 아래 주석: 「Aumos는 담당을 추정하지 않습니다. 담당 없는 포지션은 당신이 지정할 때까지 그대로이고, 한 포지션의 담당은 한 매니저입니다.」
4. **「승인하고 전송」**(`approvals.approve-send`) → 확인 문구
   > **「이 거래를 승인하시겠습니까? Aumos가 {계좌}(으)로 주문 {n}건을 보냅니다.」**

### 9-A.3 CLI로 승인할 때

체크박스에 해당하는 것이 `assignments` 필드다 — **`assetKey` → 화면이 보여 준 `version`**:

```bash
ask '{"id":1,"command":{"kind":"approve-decision","decisionId":"dec_…","verdict":"approved","assignments":{"equity:XKRX:316140":0}}}' 40
```

- ⛔ **`assignments` 키가 없는 승인은 담당을 안 움직인다.** 기본값이 부재인 것이 #793 계약 ②의 요구다.
- `version`은 **미리보기가 보여 준 그 값**을 그대로 돌려준다. 그 사이 다른 승인이 담당을 가져갔으면:
  > *the manager in charge of … changed while this was on screen — it stands at version N; look again and approve once more*
- 담당이 **될 매니저는 payload가 못 고른다** — 언제나 봉인된 판단의 저자다.
- 거부는 절대 담당을 지정하지 않는다.

### 9-A.4 체결 확인

```bash
echo '{"id":1,"query":{"kind":"approvals"}}' | $HOST
```

`settled[]`의 행에서:

| 필드 | 값 |
|---|---|
| `verdict` | `"approved"` |
| `orders[].state` | `filled` / `partially_filled` / `accepted` — ⛔ `unsubmitted`면 안 나갔다 |
| `orders[].brokerOrderId` | **벤더의 주문 id.** 우리 `clientOrderId`가 아닌 것이 #161 포트 확장의 증거다 |
| `orders[].filledQuantity` | > 0 |
| `orders[].averageFillPrice` | `Money` |
| `divergence` | `null`이어야 한다. 아니면 **보여 준 것과 보낸 것이 다르다** — 절대 숨기지 않는다 |

요약 문장(워커의 `ExecuteResult.summary`, stderr로 나온다):
```
1 of 1 order(s) reached the broker.
```
실패 문장 예:
```
316140: the broker refused the order — …
316140: could not be sent (…). It is recorded and unsent; Aumos will ask the broker about it before trying again.
```

DB로 직접 보고 싶다면 (읽기 전용으로 연다):
```bash
sqlite3 -readonly "$AUMOS_HOME/kernel.db" \
 "select id,state,venue_state,broker_order_id,filled_quantity,average_fill_price_minor from orders;"
sqlite3 -readonly "$AUMOS_HOME/kernel.db" \
 "select portfolio_id,asset_key,version,state,manager_instance_id,ground,assigned_by_decision_id from position_assignments;"
sqlite3 -readonly "$AUMOS_HOME/kernel.db" \
 "select id,sequence,action,manager_instance_id,substr(hash,1,20) from decisions order by sequence;"
```

### ✅ 체크포인트 ③
- `approvals` 테이블에 `decision_id` 1행, `verdict='approved'`
- `orders`에 `broker_order_id`가 채워지고 `filled_quantity > 0`
- **`position_assignments`에 `state='assigned'`, `ground='approval'`, `manager_instance_id='agt_…'`, `version=1` 행** ← 체크박스를 켰다는 증거

---

## 9-B. 두 번째 런 — 자기 포지션 읽기 + WATCH 재arm (체크포인트 ④)

체결이 장부에 반영되게 먼저 다시 마크한다(15분 창 주의):

```bash
{ echo '{"id":1,"command":{"kind":"mark-books","portfolioId":"pf_…"}}'; sleep 20; } | $HOST
echo '{"id":1,"query":{"kind":"portfolio"}}' | $HOST     # positions[]에 그 종목이 서야 한다
```

두 번째 런:
```bash
ask '{"id":1,"command":{"kind":"start-run","packageId":"shareholder-rerating","managerInstanceId":"agt_…","live":true}}' 600
RUN2=$(ls -t "$AUMOS_HOME/runs" | head -1)
```

### 무엇을 볼 것인가

**① 매니저가 그 포지션을 자기 것으로 읽었는가.** `portfolio_get`이 모든 보유에 `assignment`를 실어 준다(#814). 툴 설명이 계약을 그대로 적는다:
> *EVERY HOLDING SAYS WHO RUNS IT, IN `assignment`. `state: "assigned"` names the manager instance in `managerInstanceId`, and that is the SAME id `context_get` hands you for yourself — compare them.*

```bash
grep -n 'portfolio_get\|context_get\|assignment' "$AUMOS_HOME/runs/$RUN2/mcp-audit.jsonl" | head
cat "$AUMOS_HOME/runs/$RUN2/invocation.json" | jq '.portfolio.positions[] | {symbol:.asset.symbol, assignment}'
```
✅ `assignment.state == "assigned"` **그리고** `assignment.managerInstanceId == "agt_…"`(설치한 그 인스턴스).

⚠️ 이것이 **#819/#823이 닫은 결함의 반대 증거**다. `assignment`가 없으면 매니저가 자기 6% 포지션을 남의 것으로 읽고, `position-weight`가 **총**비중이라 감축 intent가 **매도로 나간다**. SR §5b(`ownHeldWeight`·`otherHeldWeight`·`hostTargetWeightFloor`)가 여기서 돈다.

**② 두 번째 판단이 리뷰를 다시 arm했는가.** SR §7이 매 런 다음 리뷰를 arm하도록 적혀 있다.
```bash
echo '{"id":1,"query":{"kind":"plans"}}'  | $HOST
echo '{"id":1,"query":{"kind":"theses"}}' | $HOST
jq '.decision | {action, nextReview}' "$AUMOS_HOME/runs/$RUN2/decision.json"
echo '{"id":1,"command":{"kind":"wake-status"}}' | $HOST
```
✅ `plans`에 `armed` 계획이 서고 그 `decisionId`가 두 번째 판단을 가리킨다.

⚠️ **호스트는 「깨어난 런이 다시 arm한다」를 단언하지 않는다** — 그것은 제안의 몫이다. 세 `PROMPT.md`의 산문 보장이지 호스트가 강제하는 계약이 아니다. 그래서 이 체크포인트는 **관측**이지 단언이 아니다.

**③ 두 번째 판단은 보통 `WATCH`/`HOLD`다.** 이미 담당이고 목표 비중에 도달했으면 `target-weight-already-held` 계열로 WAIT하는 것이 옳은 동작이다. ⛔ **두 번째 BUY가 나오면 그것이 재실행 중복(#787)이므로 승인하지 말고 기록한다.**

### ✅ 체크포인트 ④
- 두 번째 런의 `invocation.json`에서 그 포지션의 `assignment.managerInstanceId`가 **자기 id**
- `plans`에 새로 arm된 리뷰
- 두 번째 판단이 중복 매수를 내지 **않았다**

---

## 9-C. Forward Track Record (체크포인트 ⑤)

```bash
echo '{"id":1,"query":{"kind":"performance","portfolioId":"pf_…"}}' | $HOST
```

앱에서는 **PERFORMANCE는 라우트가 아니다** — MANAGERS에서 그 매니저 한 명의 페이지 안 섹션이다(#197). `apps/desktop/src/screens/Performance.tsx`의 `TrackRecord` / `TrackRecordCard`.

볼 것:

| 필드 | 기대값 |
|---|---|
| `instanceId` | `agt_…` |
| `packageId` | `shareholder-rerating` |
| `mode` | `live` |
| **`runs[].decisionId`** | **승인한 `dec_…`** ← **이것이 「결정을 건다」의 실물이다** |
| `runs[].runId` / `startedAt` / `outcome` | `decided` |
| `axes[]` | 다섯 축 전부 `insufficient` — **정상** |
| `portfolio` | 그 펀드 |

축이 전부 `insufficient`인 이유(`track-record.ts`의 `MINIMUMS`):
`reliabilityRuns: 5`, `disciplineDecisions: 5`, `coherenceDecisions: 3`, `acuityResolved: 10`, `composureIntervals: 2`.
`acuity`는 그 위에 **판단의 `forecast.horizonDays`가 지나야** 해소되므로, 한 번의 런으로는 *「아직 아니다 — N일에 해소된다」*가 정답이다.

⚠️ **`untilled/aumos#887`이 요구한 여섯 가지는 `#899`로 들어갔다** — 단, 실제 체결로 들어오는 수수료·제세금과 069500 마크는 이 런에서 처음 관측된다. 볼 곳:
- `performance` → 해당 인스턴스 행 → `decisionRecords[]`: `realised`(체결 둘) · `unrealised`(마크) · `forward`(진입 마크 → 창 종료 마크) 세 층이 **따로** 있고 합산 필드가 없다.
- `decisionRecords[].window.opened == "fill"` — 체결이 실적에 닿았다는 증거.
- 주문 행의 `fees`/`taxes` — 토스 체결 응답의 `execution.commission`/`tax`가 실려야 하고, 없으면 `null`(=`data_missing`)이지 `0`이 아니다.
- `benchmarks[]` — 통화마다 한 행. 원화 장부면 `069500/XKRX`가 마크돼 있어야 하고, 마크가 없으면 `benchmark-absent-for-currency` 문장이 뜬다(가격 소스를 붙이라는 뜻).
- `aggregate` — 판단 수, 귀속/미귀속, hit-rate(SELL은 내려야 맞힘, WAIT은 ±5%), 층별 분위수(3건 미만이면 `insufficient`).

### ✅ 체크포인트 ⑤
`performance`의 해당 인스턴스 행에서 `runs[]`가 `decisionId: dec_…`를 든다. **그 이상은 이 빌드에 없고, 없는 것을 없다고 기록하는 것이 이 체크포인트의 값이다.**

---

## 9-D. 후보 발굴 한 사이클 관측 (#305)

> **무엇을 닫는 절인가.** `aumos-catalogue#305`의 마지막 완료 조건 — *「게시된 세 패키지의 설치·실행으로
> `Toss/OpenDART → 후보 → manager-memory → 다음 실행 재개 → 완결 조사` 한 사이클을 관측한다」* — 은
> 이 저장소에서 닫을 수 없다. fixture는 계약을 잡지만 **벤더의 실제 응답으로 유니버스가 선언되는지**는
> 잡지 못한다. 그래서 절차만 여기 적는다.
>
> ⛔ **이 절은 주문을 내지 않는다.** 후보 발굴은 `PORTFOLIO_REVIEW`의 2단계이고, 관측 대상은 판단이
> 아니라 **장부와 커서**다. ③·⑤와 달리 돈이 움직이지 않으므로 §9-A 없이 돌려도 된다.

**한 사이클은 런 하나가 아니라 둘이다.** `observation_file`이 발급한 `evidenceId`는 런이 끝나야
커널에 커밋되므로(**H-4**) 같은 런에서 인용할 수 없다. 그래서 런 1이 증거를 걸어 두고 런 2가 그것을
되읽는다. 이 왕복이 곧 «재개»의 실물이다.

### 9-D.1 런 1 — 유니버스 선언 · 스윕 · 장부 쓰기

패키지마다 유니버스를 여는 경로가 다르다. 무엇을 선언했는지가 나머지 전부를 결정한다.

| 패키지 | 유니버스를 여는 경로 | `universeSource`에 서야 할 값 |
|---|---|---|
| FMR | `connection_request` → 토스 `/api/v1/stocks/all` (⚠️ 허용 필터 **값**은 미실측 — **H-1**) | `toss:/api/v1/stocks/all` |
| CT | `source_cache_refresh` → OpenDART 공시 인덱스(+ `corp-codes` 조인) | `toss:/api/v1/stocks/all` 또는 공시 인덱스 — **런이 실제로 받은 것** |
| SR | `source_cache_refresh` → OpenDART 환원 공시 | `open-dart:/api/list.json via source-cache` |

```bash
ask '{"id":1,"command":{"kind":"start-run","packageId":"fundamental-mean-reversion","managerInstanceId":"agt_…","live":true}}' 900
RUN1=$(ls -t "$AUMOS_HOME/runs" | head -1); echo "$RUN1"
```

⚠️ **`live: true`가 없으면 픽스처 세계로 돈다** — 그러면 이 절이 재려는 것을 하나도 재지 못한다(§7.3).

### 9-D.2 무엇을 볼 것인가 — `mcp-audit.jsonl`

런 디렉토리의 `mcp-audit.jsonl`이 **매니저가 실제로 부른 툴 전부**다(§7.4). 세 줄만 찾으면 된다.

```bash
A="$AUMOS_HOME/runs/$RUN1/mcp-audit.jsonl"
grep -c 'source_cache_refresh' "$A"   # ≥1 — 공시 레인이 실제로 열렸는가
grep -c 'observation_file'     "$A"   # ≥1 — 웹 원문 하나가 증거가 됐는가
grep -c 'files_write'          "$A"   # ≥1 — 장부가 실제로 쓰였는가
jq -r 'select(.tool=="observation_file") | {url:.args.url, publishedAt:.args.publishedAt, evidenceId:.result.evidenceId}' "$A"
```

| 보이는 것 | 뜻 |
|---|---|
| `source_cache_refresh` 없음 | 공시 레인을 **연 적이 없다**. `filingLaneStatus`가 `unstated`여야 하고, 그러면 판단은 `discovery_not_run`이다 |
| `observation_file` 없음 | 웹 레인이 안 돌았다. FMR은 web이 선택 레인이라 정상일 수 있고, **CT·SR은 필수 레인이라 결함**이다 |
| `files_write` 없음 | 스윕 결과가 **어디에도 남지 않았다**. 다음 런은 처음부터 다시 훑는다 — 그 자체가 이 절의 실패다 |
| `files_write`가 `expectedHash` 없이 | CAS를 건너뛴 것이다. 동시 런이 서로를 덮어쓴다(**H-6**) |

⚠️ **`claude`의 대화 기록은 런 디렉토리에 없다**(§7.4). `mcp-audit.jsonl`로 부족하면
`~/.claude/projects/<enc>/<uuid>/`를 `claude --resume <uuid>`로 열어 같은 세 이름을 찾는다.

### 9-D.3 무엇을 볼 것인가 — 장부

장부는 **문서 하나**이고 커서가 그 **안에** 있다(**H-6** — 다중 파일 원자적 쓰기가 없다). 경로는
패키지마다 자기 것이다.

| 패키지 | 장부 경로 (`files_read`의 `path`) |
|---|---|
| FMR | `state/candidates.json` |
| CT | `state/candidate-ledger.json` (+ `state/catalyst-register.json` — ⛔ **합치지 않는다**) |
| SR | `state/candidates/shareholder-rerating.json` |

```bash
jq -r '.args.path' <(grep 'files_write' "$A")          # 위 표의 경로가 나와야 한다
jq -r '.args.content' <(grep 'files_write' "$A") | jq '{cursor, n:(.candidates|length), states:[.candidates[].state]}'
```

✅ 런 1이 성립한 모습:
- `cursor.value`가 **널이 아니고**, `failedRanges[]`에 실패한 범위만 남아 있다.
- 후보 하나가 `state: "researching"`이고 `evidenceIds[]`에 방금 발급된 `ev_…`를 들고 있다.
- `openQuestions[]`가 비어 있지 **않다** — 비었는데 `researching`이면 상태가 거짓이다.

⛔ **장부에 있으면 안 되는 것**(#305 범위 밖, 검증기가 `memory_holds_vendor_payload`로 막는다):
`open`/`high`/`low`/`close`/`volume` 배열, 공시 본문이나 `excerpt`, `quantity`/`cash`/`averageCost`,
미결 제안. 손으로도 한 번 본다:
```bash
jq -r '.args.content' <(grep 'files_write' "$A") | grep -E '"(close|volume|excerpt|quantity|cash|averageCost)"' && echo "⛔ 결함"
```

### 9-D.4 `discoveryStatus` — rationale에서 읽는 법

발굴 통계는 **판단의 근거 산문에 실린다**. `decision.json`에서 네 단어 중 하나를 찾는다.

```bash
jq -r '.decision.rationale' "$AUMOS_HOME/runs/$RUN1/decision.json" | grep -oE 'candidates_produced|no_candidate_qualified|discovery_not_run|discovery_incomplete'
```

| 나온 값 | 그때 같이 서 있어야 하는 것 |
|---|---|
| `candidates_produced` | `newCandidates + resumedCandidates ≥ 1`, `cursorAfter ≠ cursorBefore` |
| `no_candidate_qualified` | `universeDeclared: true` **그리고** 필요한 레인 전부 `open` **그리고** `symbolsFailed: []`. ⛔ **셋 중 하나라도 아닌데 이 단어가 나오면 그것이 #305가 막으려던 바로 그 오독이다** |
| `discovery_incomplete` | `symbolsFailed[]`가 비지 않았고 `cursorAfter == cursorBefore` |
| `discovery_not_run` | 유니버스 미선언이거나 예산을 보유 검토가 다 썼다. 이 단어는 `uncertainty` 항목에 **그대로** 실려야 한다 |

⚠️ **후보 0건은 기본값이 아니다.** 네 단어 중 아무것도 안 나오면 그것은 «후보 없음»이 아니라
**관측 실패**다 — 그대로 기록한다.

### 9-D.5 런 2 — 재개 · `evidenceId` 왕복 · 완결 조사

같은 인스턴스로 한 번 더 띄운다. ⚠️ 유니버스를 다시 선언하지 **않아도** 된다 — 재개가 먼저다.

```bash
ask '{"id":1,"command":{"kind":"start-run","packageId":"fundamental-mean-reversion","managerInstanceId":"agt_…","live":true}}' 900
RUN2=$(ls -t "$AUMOS_HOME/runs" | head -1)
B="$AUMOS_HOME/runs/$RUN2/mcp-audit.jsonl"
grep -c 'files_read'   "$B"    # ≥1 — 장부를 먼저 읽었는가
grep -c 'evidence_get' "$B"    # ≥1 — 런 1의 ev_… 를 되읽었는가
jq -r 'select(.tool=="evidence_get") | .args.evidenceId' "$B"
```

✅ 체크포인트 — 한 사이클이 닫힌 모습:
- 런 2의 `evidence_get`이 든 `ev_…`가 **런 1의 `observation_file`이 발급한 그 id**다(**H-4**의 왕복).
- 그 후보의 `state`가 `researching` → `watching | proposed | excluded` 중 하나로 **전이**했고,
  `history[]`에 그 전이가 한 줄 붙었다.
- 같은 종목의 **두 번째 행이 생기지 않았다** — 키는 `(market, symbol)`이고 재발견은
  `lastSeenAtEpochMs`만 갱신한다. 행이 둘이면 멱등성 결함이다.
- 런 1이 실패한 범위를 남겼다면 런 2가 그것을 **먼저** 재시도했고 `attempts`가 올랐다.

⛔ **여기서 BUY가 나오는 것은 이 절의 성공 조건이 아니다.** 웹 요약만으로 만든 제안을 #305가 범위
밖으로 못박았으므로, 완결 조사가 `watching`으로 끝나는 것도 정답이다. 볼 것은 **장부가 자랐는가**다.

### ⬜ 이 절이 재지 못하는 것

- **세 패키지 동시 관측.** 같은 종목이 두 데스크에 동시에 서는 모습은 #268의 것이고, 이 절차는 한
  인스턴스만 돌린다(**H-8**).
- **종목 지목.** `start-run`에 `subject`가 없다(⚠️-3 / **H-5**) — 어느 종목이 후보가 되는지 고를 수 없다.
- **300봉.** `prices/daily` 캐시가 ~270 세션이라 FMR의 게이트가 실제로 계산되는지는 매니저가 직접
  `/api/v1/candles`를 `nextBefore`로 페이지해야만 확인된다(**H-2**).

---

## 10. 정리 — 연습이 포지션보다 오래 살지 않게

```bash
# 1) 되판다. SR에게 청산을 시키는 것이 정석이지만(EXIT 판단 → 승인),
#    연습을 끝내는 가장 확실한 길은 토스증권 앱에서 직접 매도하는 것이다.
#    ⛔ Aumos에는 취소 경로가 없고, 미체결 주문도 앱에서만 취소된다.

# 2) 자격증명 흔적 지우기
rm -f ~/workspace/personal/aumos/.m8c-credentials.json
unset TOSS_CLIENT_ID TOSS_CLIENT_SECRET

# 3) 로그인 닫기 (키체인에 아무것도 안 넣었더라도 행은 지운다)
ask '{"id":1,"command":{"kind":"apply-setting","setting":{"kind":"close-connection","connectionId":"conn_…"}}}' 15

# 4) 저장소. ⚠️ 봉인된 판단이 들어 있다 — #256에 붙일 것을 먼저 뽑아낸 뒤에 지운다.
#    지우기 전에:
sqlite3 -readonly "$AUMOS_HOME/kernel.db" "select id,sequence,action,decided_at,hash from decisions;" > /tmp/256-decisions.txt
cp -R "$AUMOS_HOME/runs" /tmp/256-runs
# 그 다음에만:
# rm -rf "$AUMOS_HOME"
```

⚠️ 매니저를 떼려면 `remove-manager-instance`인데 **런이 하나라도 있으면 거절한다**(기록을 고아로 만들지 않기 위해). 끄는 것은 `set-instance-mode` → `disabled`.

---

## 11. #256에 붙일 체크리스트

```markdown
## 실제 런 1회 — 관측 결과 (YYYY-MM-DD)

환경: macOS <ver> · node <ver> · pnpm 11.0.8 · aumos <sha> · `claude` <ver>
패키지: **shareholder-rerating 0.5.7** (`registry-fetch` 경로로 설치 — 게시된 바이트)
브로커: 토스증권 **live**(샌드박스 없음) · 계좌 `<accountSeq>` · 장부 ₩<…>
저장소: `$HOME/.aumos-256` (전용)

- [ ] ① **설치** — `<AUMOS_HOME>/managers/<agt_…>/aumos.json` = 0.5.7, `runnable-managers`에 행
      `open-dart@0.1.0` 설치 + `api-key` 저장, `source-gaps.json` = `[]`
- [ ] ② **`decision_submit`** — `runs/<run_…>/decision.json` 존재, action = `<BUY|…>`,
      `approvals.pending[]`에 `dec_…`. 해시체인 `verifyChain` 통과
- [ ] ③ **승인 + 담당 지정 + 체결**
      - `approvals` 1행 `verdict=approved`, `divergence=null`
      - `orders`: `broker_order_id=<…>`, `state=<filled|…>`, `filled_quantity=<n>`, `average_fill_price=<…>`
      - **`position_assignments`: `state=assigned`, `ground=approval`, `manager_instance_id=agt_…`, `version=1`**
        (승인 화면의 「운용 담당」 체크박스 / `approve-decision.assignments`)
- [ ] ④ **재읽기 + 재arm** — 두 번째 런의 `invocation.json`에서
      `positions[].assignment.managerInstanceId == agt_…`, `state == "assigned"`
      `plans`에 새 armed 계획, 두 번째 판단이 중복 매수를 내지 않음
- [ ] ⑤ **Forward Track Record** — `performance`의 `shareholder-rerating` 행이
      `runs[].decisionId == dec_…`, `decisionRecords[].window.opened == "fill"`,
      주문 행 `fees`/`taxes`가 관측값 또는 `null`(0 아님), `benchmarks[]`에 KRW 행.
      다섯 축 전부 `insufficient`(최소치 미달, 정상)

### ⬜ 이 런이 재지 못한 것
- 배당은 두 브로커 어댑터 모두 관측 불가라 컬럼 없이 `data_missing`이다(untilled/aumos#899). 069500은
  가격수익 지수라 초과수익이 분배수익률만큼 낙관적이다.
- `acuity`는 판단의 `forecast.horizonDays`가 지나야 해소된다 — 이 런으로는 「아직 아니다」가 정답.
- 페이퍼 대조군이 없다. 토스에는 시뮬레이터가 없고 Alpaca는 XKRX를 못 다룬다.
- 매니저 하나·판단 둘이다. 세 패키지 동시 운용은 여전히 #789 2단계의 것.
- 주문 취소 경로를 재지 않았다 — Aumos에 없다(`cancelOrder`가 던진다).
```

---

## 12. ⚠️ 코드에서 확정하지 못한 것

| # | 항목 | 상태 |
|---|---|---|
| ⚠️-1 | **`claude` CLI 버전** | 핀은 **있고 강제된다**(`>=2.1.221 <3.0.0`). ⚠️ 남는 미지수는 **`claude` 3.x**다 — `belowMajor: 3`이므로 메이저 3이 나오면 `unsupported-version`으로 막힌다. 오너의 CLI가 이미 3.x면 **이 런북은 그대로 돌지 않는다**. 먼저 `vendors refresh`로 확인할 것 |
| ⚠️-2 | **최소 주문 금액(더스트 하한)** | `PlanInput.minNotionalMinorUnits`가 선언만 있고 **생산자가 없다**(`planner.ts` 밖 어디에도). 실질 하한은 ⑴ `roundQuantity`의 `Math.trunc`(1주 미만 = 0주)와 ⑵ 토스의 거절뿐. **KRX/토스의 실제 최소 주문 금액을 코드가 모른다** |
| ⚠-3 | **특정 종목 지목** | `start-run`에 `task`/`subject` 인자가 **없다**. 수동 런은 언제나 `PORTFOLIO_REVIEW`(#517). `ASSET_REVIEW`/`EVENT_REVIEW`는 Wake Engine이 이벤트를 이름 댈 때만 선다. 세 패키지의 `config.schema.json`도 `additionalProperties:false`에 심볼 필드가 없다 → 남은 손잡이는 **맨데이트 `objective` 자유 텍스트**뿐이고, 그것이 실제로 후보 선정을 얼마나 좁히는지는 **LLM 행동이라 코드가 답하지 않는다** |
| ⚠️-4 | **호가 단위·상하한가** | 의도적으로 포트를 안 건넌다. 거절이 벤더 에러 본문으로만 온다 — 지정가가 어떤 형태로 거절되는지 실측 없음 |
| ⚠️-5 | **`runtimes` 검사** | **판정이 갈렸다.** `packages/amp/src/manifest.ts:906`의 주석은 「설치 화면이 벤더를 이름으로 거절한다」고 적지만, `previewInstall`/`install-manager`를 훑어 그 검사를 **찾지 못했다** — `package-lint`(카탈로그 CI)만 `runtimes`를 읽는다. **실무상 무해하다**(SR은 `["claude"]`이고 우리도 `vendor: "claude"`로 설치한다). 다만 *「거절이 있다」*를 믿고 설계하지 말 것 |
| ⚠️-6 | **`registry-fetch` 목적지 문서 불일치** | `CLAUDE.md`·`kernel-host/README.md`는 `~/.aumos/managers/<id>@<ver>/`라 적고 **코드는 `staging/<id>@<ver>/`**에 쓴다. 이 런북은 코드를 따랐다 |
| ⚠️-7 | **staging TTL** | 호스트가 열릴 때 staging을 쓸되 1시간 안에 받은 것은 남긴다. 호스트를 여러 번 여닫으며 시간을 끌면 `registry-fetch`를 다시 해야 할 수 있다 |
| ⚠️-8 | **`aumosHome()` 구현 둘이 fallback에서 갈린다** | 호스트는 `os.homedir()`, 워커는 `env.HOME`. `AUMOS_HOME`을 **명시하면** 문제가 없다 — 그래서 이 런북은 전 구간에서 명시한다 |
| ⚠️-9 | **`AssignmentGround.investor`에 생산자가 없다** | 담당은 **주문이 실제로 나가는 승인에만** 올라탄다. 투자자가 화면에서 직접 담당을 지정/해제하는 길이 이 빌드에 없다 |
| ⚠️-10 | **패키지 바이트 검증이 없다** | `origin.json`의 `sha`는 *요청한* 커밋의 기록이지 검증이 아니다(§45 미구현). 매니저 패키지에 서명·digest 대조가 없다 |
| ⚠️-11 | **`.aumos/first-party.json`은 호스트가 안 읽는다** | 카탈로그 CI 산출물이다. publisher 귀속의 실제 근거는 `AUMOS_OFFICIAL_PACKAGES`(#477 이후 기본값 없음) + 패키지가 도착한 마켓플레이스 URL |
| ⚠️-12 | **SR이 실제 OpenDART 응답으로 BUY에 닿는지** | fixture는 BUY에 닿지만 그 입력은 손으로 만든 값이다. **실제 DART 응답 모양으로 SR이 `programme.executedAmount`·`cet1`·`recurringEps`를 채울 수 있는지 아무도 재지 않았다** — 이것이 이 런이 재려는 바로 그 미지수다 |
| ⚠️-13 | **주문이 실제로 체결되기까지의 시간** | `placeOrder` 직후 `GET /api/v1/orders/{id}`로 한 번 되읽는다. 그 시점에 `accepted`이고 체결은 나중일 수 있다 — `state`가 `filled`로 가는 것은 다음 reconcile/마크에서 보인다. **그 주기를 코드에서 확정하지 못했다.** 실무 대응: `mark-books`를 다시 돌리고 `approvals`를 다시 읽는다 |
| ⚠️-14 | **`maxDrawdown`은 저장되고 집행되지 않는다** | 맨데이트에 적히지만 강제하는 곳이 없다(설계). 이 연습의 안전장치로 믿지 말 것 |
| ⚠️-15 | **`AUMOS_WAKE`를 끌 것인가** | 이 런북은 Wake Engine을 켠 채로 돈다(스케줄 발화를 보려면 필요). ⚠️ 켜 두면 SR의 `30 16 * * 1-5`가 **저녁에 스스로 런을 띄워 구독을 쓴다**. 통제된 관측만 원하면 `AUMOS_WAKE=0`으로 띄운다 — **타이머 하나만** 꺼지고 `wake-tick`·`mark-books`·`start-run`은 그대로 돈다. 정확히 `'0'`이어야 하고, 없는 것은 켜진 것이다 |
| ⚠️-16 | **동시 런 상한** | `MAX_LIVE_RUNS = 4`, 틱 간격 60초, 누락된 스케줄은 **따라잡지 않는다**(#642 strict skip, `CADENCE_GRACE_MS = 5분`). 노트북이 자고 있었다면 밀린 런은 **0건**이고 `CadenceGap` 행으로만 남는다 |
| ⚠️-17 | **`run_…` id 형식** | 런 디렉토리 이름은 워커가 민팅한 run id다. 프로덕션 저장소에서의 정확한 형식을 확정하지 못했다 — 이 런북은 전부 `ls -t "$AUMOS_HOME/runs" \| head -1`로 집는다 |
| ⚠️-18 | **H-1 · 시점 고정 XKRX 유니버스가 없다** | `/api/v1/stocks/all`이 유일한 전체 시장 경로이고 네 필터(`market`·`status`·`securityType`·`commonShare`)의 **허용 값이 미실측**이다. 목록은 오늘의 것이라 생존편향을 싣고 보정할 길이 없다. 세 패키지는 필터 값을 지어내지 않고 받은 행 수를 그대로 `universeCount`로 적는다 → 열거가 거절되면 `universeDeclared: false` · `discovery_not_run`. **호스트 이슈 필요** |
| ⚠️-19 | **H-2 · 완료봉 300개에 닿는 경로가 하나뿐이다** | `market_bars`는 250에서 잘리고 `prices/daily` 캐시는 400 캘린더일 ≈ **270 세션**으로 300 미만이다. 매니저가 `connection_request /api/v1/candles`를 `nextBefore`로 직접 페이지해야만 닿고, `adjusted`를 **매 페이지 명시**해야 한다. 짧은 시계열을 채우거나 두 수정 기준을 섞는 것은 금지 |
| ⚠️-20 | **H-3 · source-cache 권한이 세 패키지에 실제로 닿는지 미확인** | 매니페스트가 `source-cache:read`/`write`를 선언했을 뿐 어떤 런도 그 툴이 실제로 서는지 보지 못했다. ⛔ 대체책으로 `manager-memory`에 두 번째 캐시를 만들지 않는다 — 권한이 없으면 레인이 `dark`이고 런은 `discovery_not_run`이다 |
| ⚠️-21 | **H-4 · 관측 → `evidenceId` 왕복이 런 둘에 걸친다** | `observation_file`이 id를 발급해도 런이 끝나기 전에는 커널에 커밋되지 않아 **같은 런에서 인용할 수 없다.** 그래서 id가 후보의 `evidenceIds[]`에 실려 다음 런으로 넘어간다(§9-D.5가 재는 것이 이것이다) |
| ⚠️-22 | **H-5 · `start-run`에 종목 subject가 없다** | ⚠️-3과 같은 사실의 발굴 쪽 얼굴이다. 수동 런은 언제나 `PORTFOLIO_REVIEW`이므로 «이 종목을 조사해라»를 지시할 수 없고, `ASSET_REVIEW`인 척하지도 않는다. 남은 손잡이는 맨데이트 `objective` 자유 텍스트뿐 |
| ⚠️-23 | **H-6 · 다중 파일 원자적 쓰기가 없다** | `manager-memory`는 파일 툴 여섯 개와 `expectedHash` CAS뿐이다. 그래서 장부는 **문서 하나**이고 커서가 그 안에 있다 — 파일 둘로 나누면 사이에서 죽은 런이 «장부에 없는 스윕을 주장하는 커서»를 남긴다 |
| ⚠️-24 | **H-7 · 수정 기준·거래정지·기업행동·거래대금·시장달력의 모양이 미실측** | 캔들은 주식 수 기준 거래량만 싣고 기업행동은 아예 없다. FMR은 기준이 선언되지 않으면 `adjustment_basis_undeclared`로 **거절**하지 가정하지 않고, 거래대금을 거래량×가격으로 유도하지 않는다 |
| ⚠️-25 | **H-8 · 한 펀드의 두 매니저가 같은 종목을 발견할 수 있다** | 발굴 단계에서 중복 제거를 하는 곳은 어디에도 없고, 그것이 설계다 — 같은 종목이라도 세 전략에는 세 개의 가설이다. 계좌 차원에서 노출이 두 번 들어오는 문제는 **#268**의 것이지 이 파이프라인의 것이 아니다 |

---

### 부록 — 이 런북이 쓴 근거 파일

```
aumos/
  CLAUDE.md                                     §"명령어" · §"환경변수"
  services/kernel-host/README.md:1259-1383       "The live round trip at the second broker, by hand"
  services/kernel-host/scripts/m8c-live.mjs      check|connect|accounts|book|read|order|auto
  services/kernel-host/src/protocol.ts:1277      approve-decision (+ assignments, #785)
  services/kernel-host/src/protocol.ts:2117      ApprovalPreviewView.assignments
  services/kernel-host/src/track-record.ts       CLQT 다섯 축 · MINIMUMS · acuity()
  services/kernel-host/src/views.ts:985-1100     performanceView
  services/kernel-host/src/runtime-paths.ts:127  runWorkspace = <AUMOS_HOME>/runs
  packages/credentials/src/catalog.ts:398-432    toss · environments: ['live']
  packages/skill-gateway/src/adapters/toss-execution.ts   placeOrder · cancelOrder가 던진다
  packages/skill-gateway/src/tools/decision.ts   decision_submit
  packages/skill-gateway/src/tools/discovery.ts  portfolio_get · context_get
  packages/manager-runtime/src/worker.ts:857     task 선택 (#517) · :1291 fixtures = live !== true
  packages/manager-runtime/src/install.ts:71     AUMOS_APP_VERSION = '0.5.0'
  packages/manager-runtime/src/setup.ts:812      install-manager
  packages/manager-runtime/src/grant.ts:575      runPaths
  packages/kernel/src/store/schema.ts:2110       position_assignments
  packages/kernel/src/execution/approve.ts       approveDecision
  packages/i18n/src/dictionary/ko-KR.ts:2006     approvals.assign.*

aumos-catalogue/
  managers/shareholder-rerating/{aumos.json,PROMPT.md,config.schema.json,README.ko.md}
  managers/shareholder-rerating/fixtures/cases.json   financial-positive-reaches-buy
  sources/open-dart/source.json                       credentials[0].name = "api-key"
  .claude-plugin/marketplace.json                     게시의 정본
```

---

## 알파카 페이퍼 펀드에서 하는 변형

> 투자자가 **알파카 페이퍼 계좌를 연동한 펀드**를 하나 더 열어 두었다. 이 절은 그 펀드에서
> 무엇이 닫히고 무엇이 안 닫히는지, 그리고 **패키지를 바꿔야 하는 지점**을 적는다.
>
> ⛔ **결론을 먼저 적는다.** 알파카 페이퍼에서 SR/CT/FMR은 **BUY에 닿을 수 없다.** 세 패키지는
> `markets: ["XKRX"]`이고 가격을 `connection:passthrough` **토스**로 받는다. 알파카 펀드에는
> 그 연결이 없으므로 국내 종목에 쓸 가격 도구가 아예 안 선다 → `data_missing` → WAIT/WATCH.
> **체크포인트 ③⑤(체결·실적)은 다른 패키지로 재고, 토스 실계좌 경로는 그대로 남는다.**

### A. 왜 SR이 알파카 펀드에서 BUY에 못 닿는가 — 그런데 설치는 된다

호스트는 **매니저를 시장으로 막지 않는다.** `packages/manager-runtime/src/install.ts:706-745`가
내는 것은 **비차단** 문제 둘뿐이다:

```
connection-not-linked  blocking: false
  "This manager names broker logins this fund does not have: toss."
source-not-installed   blocking: false
```

그래서 `acknowledged: true`면 **SR은 알파카 펀드에 깨끗이 설치된다.** 런도 뜬다. 다만
`AUMOS_BROKER_RELAYS`에 `toss`가 없으니 `connection_request`가 국내 가격을 못 가져오고, SR은
`book.totalValue`와 가격 없이는 사이징을 못 해 **`data_missing` → WAIT**로 끝난다.

⚠️ **그것은 결함이 아니라 이 런북이 재려던 경계 하나가 실제로 도는 것**이므로, 기록할 값이 있다.

### B. 다섯 체크포인트를 둘로 가른다

| | 알파카 페이퍼 + **SR**로 증명되는 것 | 근거 |
|---|---|---|
| ① **설치** | ✅ 전부 | `managers/<agt_…>/aumos.json` 0.5.7, `runnable-managers`에 행. 비차단 경고 둘이 **문장으로** 뜨는 것까지 확인 가능 |
| ② **`decision_submit`** | ✅ **단, WAIT/WATCH의 봉인** | `runs/<run_…>/decision.json` 존재 + `decisions` 행 + 해시체인. ⛔ 승인 대기열에는 **안 선다**(WAIT는 `MOVES_THE_BOOK`이 아니다) |
| ③ 승인→담당→주문→체결 | ❌ **불가** | 나갈 주문이 없다 |
| ④ **다음 런 재읽기 + 리뷰 재arm** | ⚠️ **절반** | 두 번째 런이 돌고 `plans`에 arm은 확인 가능. ⛔ **`assignment.managerInstanceId`를 자기 것으로 읽는 절반은 못 잰다** — 담당 행은 «주문이 실제로 나가는 승인»에만 생긴다(⚠️-9) |
| ⑤ Forward Track Record | ❌ 사실상 불가 | 행은 서지만 층 ①②가 전부 비고, 국내 종목이라 `benchmarks`도 안 맞는다 |

**그러므로 알파카 펀드에서 SR로 하는 일은 ①②와 ④의 절반**이고, 그것만으로도
*「세 카탈로그 패키지를 import하거나 실제 `decision_submit`을 내게 한 호스트 테스트는 없다」*
(#850)라는 문장은 **지워진다.** 그것이 이 변형의 값이다.

### C. 알파카 페이퍼 연결 — 토스와 다른 점

**`judgeConnection`은 `alpaca` + `paper`를 받는다.** ✅ 코드로 확인:
`packages/credentials/src/catalog.ts`의 알파카 행이 `environments: ['paper','live']`이고,
`connectorHasEnvironment('alpaca','paper')`가 참이라 `unsupported-environment` 거절에 안 걸린다.
(토스는 `environments: ['live']` 하나라 `paper`가 이름으로 거절된다.)

```bash
export AUMOS_HOME="$HOME/.aumos-256"
 export ALPACA_API_KEY_ID='…'          # ⚠️ paper 쌍. LIVE는 ALPACA_LIVE_* 로 이름이 다르다
 export ALPACA_API_SECRET_KEY='…'

ask '{"id":1,"command":{"kind":"apply-setting","setting":{"kind":"open-connection","connector":"alpaca","environment":"paper","label":"Alpaca Paper"}}}' 15
ask '{"id":1,"command":{"kind":"broker-accounts"}}' 30
ask '{"id":1,"command":{"kind":"apply-setting","setting":{"kind":"attach-account","portfolioId":"pf_…","connectionId":"conn_…","accountRef":"<alpaca account id>","baseCurrency":"USD"}}}' 20
```

호스트: `BROKER_PAPER_URL = https://paper-api.alpaca.markets/v2`(라이브는 `api.alpaca.markets/v2`).
환경은 **Connection 행의 사실**이지 전역 플래그가 아니다.

| | 토스 | 알파카 페이퍼 |
|---|---|---|
| 환경 | `live` 하나 — 진짜 돈 | **`paper`** — 모의 돈 |
| **주문 취소** | ⛔ **불가.** `cancelOrder`가 던진다 | ✅ **된다.** `alpaca-execution.ts`가 `client_order_id`로 벤더 id를 찾아 `DELETE /orders/{id}` |
| 소수점 주식 | 언제나 `fractionable: false` → `Math.trunc` | **종목마다 다르다** — 어댑터가 `raw.fractionable === true`를 그대로 읽는다. ETF는 보통 가능 |
| 수수료·제세금 | 체결 통보에 실려 온다 → 기록됨 | ⛔ **응답에 그 이름이 없다** → 컬럼이 영구 NULL (§E) |
| 가격 소스 | `connection:passthrough` toss | `connection:passthrough` alpaca |

⚠️ **카탈로그에 `alpaca-market` 소스는 없다.** `sources/`는 `coinbase-exchange`,
`fsc-securities-product`, `open-dart`, `openbb-fmp`, `sec-edgar` 다섯뿐이다. `atlas-trend-us`는
**소스를 하나도 안 쓰고** 가격·기업행동을 `connection_request`로 알파카 연결에서 직접 받는다 →
**`install-source`를 할 일이 없다.**

⚠️ **최소 주문 금액은 여전히 코드가 모른다**(본편 ⚠️-2). `minNotionalMinorUnits`는 생산자가 없고,
실질 하한은 `roundQuantity`와 알파카의 거절뿐이다.

### D. ③⑤를 재려면 — `atlas-trend-us` 0.2.3

**추천 이유:** 알파카 페이퍼에서 **실제로 체결까지 가는 유일한 짧은 경로**다.

- `markets: ["XNAS","ARCX","BATS"]`, `assetClasses: ["etf","cash"]` — 알파카가 실제로 채우는 것.
- `capabilities`에 **`connection:passthrough` + `connectors: ["alpaca"]`** 하나뿐. ⛔ **소스가 없다** →
  OpenDART도 SEC도 필요 없고, 설치 시 `source-not-installed` 경고도 안 뜬다.
- `config.schema.json`에 **required 필드가 없다**(`historyDays`, `feed`, `targetVolatility` 등 전부 기본값).
- `engines.aumos: ">=0.3.18"` — 호스트 0.5.0에서 통과.
- **`REBALANCE` 또는 `WAIT`을 낸다.** `REBALANCE`는 `MOVES_THE_BOOK`이라 **승인 대기열에 선다** → ③이 열린다.
- 대안 `evidence-gated` 0.11.1도 알파카를 알지만 `toss`+`alpaca`·`sec-edgar`+`open-dart`를 전부
  이름 대고 capability가 14개다 — **세팅이 훨씬 길다.** ③⑤만 재는 데는 과하다.

⚠️ 스케줄이 **`0 22 LW * *` UTC**(매월 마지막 평일) 하나다 — 기다리지 말고 **수동 `start-run`**으로 띄운다.

```bash
ask '{"id":1,"command":{"kind":"registry-fetch","packageId":"atlas-trend-us","version":"0.2.3"}}' 30
ask '{"id":1,"command":{"kind":"apply-setting","setting":{"kind":"install-manager",
  "packagePath":"'"$AUMOS_HOME"'/staging/atlas-trend-us@0.2.3",
  "portfolioId":"pf_alpaca…","vendor":"claude","acknowledged":true}}}' 30
echo '{"id":1,"command":{"kind":"runnable-managers"}}' | $HOST      # mode == "live" 확인
ask '{"id":1,"command":{"kind":"start-run","packageId":"atlas-trend-us","managerInstanceId":"agt_…","live":true}}' 900
```

**맨데이트 — 작게, 그리고 `baseCurrency: "USD"`로**:

```bash
ask '{"id":1,"command":{"kind":"apply-setting","setting":{"kind":"open-mandate","draft":{
  "label":"#256-alpaca",
  "objective":"카탈로그 매니저 실런 — 알파카 페이퍼. 소액 ETF 바스켓.",
  "horizonDays":3650,
  "constraints":{"baseCurrency":"USD","allowedAssetClasses":["etf","cash"],
    "maxPositionWeight":0.25,"cashFloor":0.05,"maxDrawdown":0.5,
    "allowShorting":false,"allowLeverage":false,"excludedSymbols":[]}}}}}' 20
```

- **`allowedAssetClasses`에 `etf`가 반드시 있어야 한다** — 없으면 맨데이트가 자산군을 **이름으로** 거절한다.
- **`baseCurrency: "USD"`가 #899의 통화별 벤치마크 기본값을 타게 한다**(§E).
- 페이퍼 계좌 잔고는 **$2,000~$10,000** 권장. `atlas-trend-us`는 바스켓 전체를 한 `REBALANCE`로
  내므로 다리가 여럿이고, 각 다리가 1주(또는 소수점 최소)에 못 미치면 조용히 빠진다.

### E. #899가 바꾼 것 — 본편 §9-C의 ⑤ 주의문은 **낡았다**

⚠️ **본편은 「체결 → Forward Track Record 연결이 없다(#887)」라고 적었는데, `#899`가 머지되어
그 문장은 더 이상 참이 아니다.** 확인: `ef5e3638` (`체결이 실적에 닿고, 세 층은 더해지지 않으며,
벤치마크는 장부의 돈으로 골라진다`), 마이그레이션 `0058_order_observed_costs`.

`performance` 질의에서 새로 볼 것:

```bash
echo '{"id":1,"query":{"kind":"performance","portfolioId":"pf_alpaca…"}}' | $HOST
```

**① 세 층 — `TrackRecordView.decisionRecords[]`와 `.aggregate`**

| 필드 | 뜻 | 알파카 첫 런에서의 기대값 |
|---|---|---|
| `realised` | **체결 둘의 차.** 진입·청산이 **둘 다** 있을 때만 `measured` | `data_missing` — 아직 안 팔았다 |
| `unrealised` | 진입 체결가와 마크의 차 | ✅ **`measured`** — 이것이 체결이 실적에 닿은 증거다 |
| `forward` | 진입 시점 마크와 창 종료 마크의 차. **체결이 없어도 존재한다** | 창이 아직 열려 있으면 `to`가 읽는 시각 |
| `excessOverBenchmark` | 층 ③ − 벤치마크 | 벤치마크 마크가 쌓여야 |
| `benchmarkReturn` | **그 판단 자신의 창**의 지수 수익 (⛔ 전역 `windowDays`가 아니다) | |

⛔ **층을 가로지르는 종합 수가 없다** — 셋을 더한 하나의 숫자를 찾지 말 것. `aggregate`는 각 층을
**분위수**(`p25`/`median`/`p75`)로 따로 읽는다(한 판단이 표를 끌고 가지 못하게).

`decisionRecords[]`의 각 행에 `fills.entry`/`fills.exit`(`FillRefView`: `orderId`·`decisionId`·`at`·
`side`·`quantity`·`price`)와 `window.opened: 'fill' | 'sealed'`가 있다 — **`opened: "fill"`이면
체결이 창을 열었다는 뜻이고, 그것이 본편 ⑤가 못 재던 바로 그 연결이다.**

**② 수수료·제세금 — 알파카에서는 `data_missing`이어야 하고 `0`이면 결함이다**

`ObservedAmountView`:
```
status: 'observed' | 'data_missing'
amount: Money | null      // ⛔ data_missing이면 null. 절대 0이 아니다
observations: number
reason: Phrase | null
```
⚠️ **알파카 어댑터는 `fees`·`taxes`를 읽지 않고 그것이 그 벤더에 대한 사실이다** — 그 거래소의 주문
문서에 그 이름이 없고 수수료는 `activities` 원장에 있는데 `BrokerReadPort`에 `activities()`가 없다.
마이그레이션이 **백필도 기본값도 두지 않은** 이유가 이것이다:

> ⚠️ `NULL`은 «0원»이 아니다. `'0'`을 답한 체결은 **관측된 0원**이고 아무 말도 안 한 체결은 부재다.

**그래서 관측할 것**: `costs.fees.status === "data_missing"`, `costs.taxes.status === "data_missing"`,
`amount === null`. **`0`이 보이면 그것을 결함으로 기록한다.**
`costs.dividends`는 **어느 브로커에서도 언제나 `data_missing`**이다(입금 이벤트를 읽을 경로가 없다).

**③ 통화별 벤치마크 — `PerformanceView.benchmarks[]`**

`services/kernel-host/src/wake/live.ts:569`:
```ts
const DEFAULT_BENCHMARK = {
  USD: { symbol: 'SPY',    market: 'ARCX' },
  KRW: { symbol: '069500', market: 'XKRX' },   // KODEX 200
}
```
- **하나가 아니라 목록이다.** 전에는 「기계에 마크된 첫 번째 지수」 하나가 모든 행에 붙었고, 그것이
  원화 장부를 미국 ETF에 재던 구조적 원인이었다. 이제 **장부가 쓰는 통화마다 하나**다.
- `BenchmarkRowView`: `asset`·`label`·`since`·`marks`. `asset.currency`가 어느 돈에 대한 것인지 말한다.
- **USD 펀드라 `SPY/ARCX`가 그대로 붙는다** — `atlas-trend-us`가 미국 ETF 바스켓이므로 이 비교가 처음으로 뜻을 갖는다.
- ⚠️ KRW 기본값 `069500`은 **가격 수익**이지 배당 재투자 총수익이 아니다(분배금을 관측할 경로가 없다).
- 덮어쓰기: `AUMOS_BENCHMARK_USD="QQQ:XNAS"` 꼴. 빈 문자열은 «그 행을 그리지 마라».
- ⛔ **`PerformanceView.benchmarkAbsent`(기계 전체에 지수가 없다)와 `TrackRecordView`의 행별 부재
  («이 돈으로 된 지수가 없다»)는 다른 사실이다.** 하나만 매니저에 대한 것이다.

⚠️ 다섯 축(`axes[]`)은 여전히 `insufficient`다 — 최소치(런 5·판단 5·해소된 판단 10)는 #899가 안 건드렸다.

### F. 이 변형이 #256에서 닫는 것과 닫지 못하는 것

**닫는다**
- 「세 카탈로그 패키지 중 하나가 실제 호스트에서 실제 CLI로 `decision_submit`을 냈다」 — SR로.
- 「승인 → 담당 지정 → 주문 → 체결 → 실적」의 **기계 경로 전체** — `atlas-trend-us`로, 모의 돈으로.
- #899의 세 층·관측된 비용·통화별 벤치마크가 **실제 체결 위에서** 어떻게 읽히는지.

**닫지 못한다**
- ⛔ **SR/CT/FMR 중 어느 것도 BUY에 닿지 못한다.** 셋 다 XKRX + 토스 가격이고, 알파카 펀드에는 그
  연결이 없다. #256의 *「각 패키지의 BUY 가능한 양성 사례」*를 **실런으로** 확인하려면 **토스 실계좌가
  여전히 필요하다**(본편 전체).
- ⛔ SR의 담당 귀속(`position_assignments`)은 알파카 펀드에서 안 생긴다 — 담당은 주문이 실제로 나가는
  승인에만 올라탄다.
- ⛔ KRW 벤치마크(`069500`)는 원화 장부가 있어야 마크된다.

**그러므로 순서는**: 알파카 페이퍼에서 ①②④-절반(SR) + ③⑤(atlas) 를 먼저 닫고, **토스 실계좌 런은
본편 그대로 남긴다.** 알파카 런이 본편을 대체하지 않는다.

### G. #256에 붙일 체크리스트 (알파카 페이퍼 변형)

```markdown
## 알파카 페이퍼 펀드 런 — 관측 결과 (YYYY-MM-DD)

환경: macOS · node <ver> · aumos <sha, #899 포함> · `claude` <ver>
펀드: `#256-alpaca` · baseCurrency **USD** · Alpaca **paper** (`paper-api.alpaca.markets/v2`)

### SR로 잰 것 (①②④-절반)
- [ ] ① `shareholder-rerating` 0.5.7이 알파카 펀드에 **설치된다** —
      비차단 경고 둘이 문장으로 뜬다: `connection-not-linked`(toss), `source-not-installed`(open-dart)
- [ ] ② 실제 CLI 런이 `decision_submit`을 냈다 — `runs/<run_…>/decision.json` 존재,
      `action = <WAIT|WATCH>`, `outcomeCode = data_missing`, 해시체인 통과
      ⚠️ 승인 대기열에는 서지 않는다(WAIT은 `MOVES_THE_BOOK`이 아니다) — 예상된 결과
- [ ] ④-절반 두 번째 런이 돌고 `plans`에 리뷰가 다시 arm됐다
      ⬜ `assignment` 재읽기 절반은 못 쟀다 — 담당 행이 없다(주문이 안 나갔다)

### atlas-trend-us 0.2.3으로 잰 것 (③⑤)
- [ ] ③ `REBALANCE` → 승인 화면 「운용 담당」 체크 → 주문 → 체결
      `orders`: `broker_order_id=<…>`, `state=filled`, `filled_quantity=<n>`
      `position_assignments`: `state=assigned`, `ground=approval`, `manager_instance_id=agt_…`
      ⚠️ 알파카는 취소가 **된다** — 토스와 다른 점
- [ ] ⑤ `performance`에서 (#899):
      - `decisionRecords[].window.opened == "fill"`  ← **체결이 실적에 닿았다**
      - `aggregate.unrealised` = `measured` · `realised` = `data_missing`(아직 미청산)
      - `costs.fees.status == "data_missing"` · `costs.taxes.status == "data_missing"` ·
        `amount == null` ← ⛔ **`0`이면 결함이다.** 알파카는 주문 응답에 그 이름이 없다
      - `costs.dividends.status == "data_missing"` (언제나)
      - `benchmarks[]`에 `SPY/ARCX/USD` 한 행
      - `axes[]`는 전부 `insufficient` (최소치 미달 — 정상)

### ⬜ 이 런이 닫지 못한 것
- SR/CT/FMR의 **BUY 양성 경로**는 여전히 미확인 — 셋 다 XKRX + 토스 가격이고
  알파카 펀드에는 그 연결이 없다. **토스 실계좌 런이 여전히 필요하다.**
- KRW 벤치마크(`069500`)는 원화 장부가 없어 마크되지 않았다.
- `realised`(층 ①)는 청산 체결이 없어 재지 못했다.
```

### ⚠️ 확인 필요 (이 절에서 추가된 것)

| # | 항목 | 상태 |
|---|---|---|
| ⚠️-A1 | **본편 §9-C의 ⑤ 주의문이 낡았다** | `#899`(`ef5e3638`)가 머지되어 「체결 → Forward Track Record 연결이 없다」는 **더 이상 참이 아니다**. 저장소에 커밋된 본편(`docs/runbooks/real-run-issue-256.md`)도 그에 맞춰 고쳐야 한다 |
| ⚠️-A2 | **카탈로그에 `alpaca-market` 소스가 없다** | `sources/`는 다섯뿐(coinbase-exchange · fsc-securities-product · open-dart · openbb-fmp · sec-edgar). `atlas-trend-us`는 소스를 안 쓰고 `connection_request`로 알파카에서 직접 받는다 — 조정자 메모의 전제 하나가 틀렸다 |
| ⚠️-A3 | **알파카 소수점 주식** | 어댑터가 `raw.fractionable`을 종목마다 읽는다. **어떤 ETF가 실제로 `true`를 답하는지 재지 않았다** — 소수점이 안 되는 다리가 1주 미만이면 조용히 빠진다 |
| ⚠️-A4 | **알파카 최소 주문 금액** | 본편 ⚠️-2 그대로 — `minNotionalMinorUnits`에 생산자가 없다. 알파카의 실제 하한(통상 $1 notional)을 코드가 모른다 |
| ⚠️-A5 | **`atlas-trend-us`가 한 번에 몇 다리를 내는가** | 바스켓 전체를 한 `REBALANCE`로 낸다. 다리 수와 필요한 최소 잔고를 실측하지 않았다 — $2,000~$10,000은 **추정**이다 |
| ⚠️-A6 | **페이퍼 계좌의 체결 지연** | 알파카 페이퍼는 정규장 밖에서 `accepted`로 머물 수 있다. `filled`까지의 주기를 재지 않았다(본편 ⚠️-13과 같은 미지수) |
| ⚠️-A7 | **`decisionRecords`를 읽는 별도 질의가 없다** | `TrackRecordView`의 필드이므로 `performance` 질의 하나로 전부 내려온다. 판단이 많아졌을 때의 페이로드 크기를 재지 않았다 |
| ⚠️-A8 | **`evidence-gated` 0.11.1을 실제로 굴려 보지 않았다** | 알파카를 알지만 capability 14개 + 소스 둘이라 세팅이 길다. ③⑤에는 `atlas-trend-us`가 낫다는 판단은 **매니페스트 비교에 근거한 것이지 실행 비교가 아니다** |
