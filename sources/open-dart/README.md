# OpenDART

Korean corporate disclosures and financial statements, read from the Financial Supervisory
Service's own filing system.

Korean single-name research has one hard requirement that a price feed cannot meet: the
moment a fact became public. `opendart.fss.or.kr` is where that moment is recorded, and
this source relays those endpoints unread.

## What you get

| | |
|---|---|
| **Serves** | OpenDART's own endpoints, relayed unread |
| **Reaches** | `opendart.fss.or.kr` |
| **Fidelity** | as-filed |
| **Coverage** | KRX-listed filers and other DART registrants; disclosures and XBRL-derived statements |
| **Cost** | free; the FSS issues an API key on registration and rate-limits by key |

| endpoint | what it answers |
|---|---|
| `/api/corpCode.xml` | the corporation-code table — the mapping every other call needs |
| `/api/company.json` | one filer's profile, including its stock code and market |
| `/api/list.json` | filings in a date range, with receipt number, receipt date and disclosure type |
| `/api/fnlttSinglAcntAll.json` | one filer's full financial statements for a business year and report |
| `/api/fnlttSinglAcnt.json` | the same filer's major accounts, when the full statement is more than needed |

## The receipt is the moment, not the period

`fnlttSinglAcntAll` answers with a business year and a report code. Neither is a
disclosure date. The date a manager must judge by is the **receipt**: `rcept_no` begins
with `YYYYMMDD` and `rcept_dt` repeats it, and every row this source returns carries one.
A back-test that filters on the fiscal period instead has read next quarter's numbers into
last quarter's decision.

Two filings frequently describe the same quarter. A **preliminary results announcement**
(영업(잠정)실적) is filed within days of the quarter's end; the **periodic report**
(분기보고서 · 반기보고서 · 사업보고서) restates it weeks later, and a **correction**
(정정) may follow either. They are three receipts, not one event, and `report_nm` and
`pblntf_ty` are what distinguish them. Treating the periodic report's receipt as the
announcement date moves the news later than it happened — the error that makes a strategy
look prescient.

Aumos does not apply any of this. It relays what the vendor sent; reading the receipt
fields and dropping rows later than the judgement instant is the manager's work, and a
manager that does not do it is not doing point-in-time research.

## What it needs from you

An **API key**, issued free at <https://opendart.fss.or.kr>. Enter it in SETTINGS → Data
sources; Aumos keeps it in the system keychain and appends it as the `crtfc_key` query
parameter on every request. No manager ever sees it, and no manager can set that parameter
itself — a request that tries is refused.

## Two vendor behaviours worth knowing before you rely on it

**`corpCode.xml` answers with a ZIP archive.** Aumos relays it exactly as sent, which means
a manager that cannot decompress bytes cannot read it. The usable alternative is
`list.json`, whose rows carry both `corp_code` and `stock_code`.

**Errors arrive with HTTP 200.** OpenDART reports its own status in a `status` field:
`000` success, `013` no data for the query, `020` request quota exceeded, `100` bad
parameter, `800`/`900` service unavailable or an invalid key. A manager that checks only
the HTTP status will read a quota refusal as an empty result — which is the difference
between *nothing was filed* and *we were not allowed to look*.

## Freshness

Filings appear in `list.json` at the receipt time. XBRL statements behind
`fnlttSinglAcntAll` follow the periodic report and are not available for a quarter that
has only been announced preliminarily — a real gap, not a missing response, and the
manager should record it as such rather than substituting the preliminary figures.
