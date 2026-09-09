import { diagnostic, finite, round } from './diagnostics.mjs'

/**
 * ── Two ledgers, and the whole point is that they never become one ─────────
 *
 * #258: «일시적 주가 상승을 촉매 성공으로 대신 기록하지 않는다», and its 완료
 * 조건: «가격 수익과 촉매 성공 여부를 별도 채점». The temptation is obvious and
 * it is not laziness — a position that is up feels like a thesis that worked,
 * and a single «did this work?» column will be filled in from whichever number
 * is available. Two objects with no shared key make that impossible to do by
 * accident, and a fixture asserts the crossed case: a **failed** catalyst under
 * a **positive** price return still scores zero on the catalyst side.
 *
 * The price side keeps three numbers apart for #256's reason — «평가손익·실현손익
 * ·전방수익률을 혼합하지 않는다». They answer different questions and have
 * different denominators, and a `combinedReturn` is refused rather than
 * computed: there is no arithmetic that makes a mark-to-market and a realised
 * exit into one figure without deciding which one the reader wanted.
 *
 * ⛔ Fees, tax and dividends are **carried separately and never netted here**.
 * Where a net figure is wanted it is `netOf` on the price ledger, computed by
 * the caller from components it can show; this module will not silently choose
 * which of them to subtract.
 */

const PRICE_FIELDS = Object.freeze(['unrealisedReturn', 'realisedReturn', 'forwardReturn', 'benchmarkExcessReturn'])
const CATALYST_FIELDS = Object.freeze(['registered', 'realised', 'delayed', 'failed', 'cancelled', 'successRate', 'delayRate'])

export function scoreboards({ catalysts = [], price = {}, benchmark = null } = {}) {
  const diagnostics = []

  if (price?.combinedReturn !== undefined) {
    diagnostics.push(
      diagnostic('combined_return_refused', 'blocked', 'A single combined return mixes a mark-to-market, a realised exit and a forward measurement, which have different denominators and answer different questions. Report the three', 'price.combinedReturn'),
    )
  }

  const adjudicated = catalysts.filter((row) => row.state === 'realised' || row.state === 'failed')
  const realised = catalysts.filter((row) => row.state === 'realised').length
  const failed = catalysts.filter((row) => row.state === 'failed').length
  const delayed = catalysts.filter((row) => row.state === 'delayed').length
  const cancelled = catalysts.filter((row) => row.cancelled === true).length

  const catalystLedger = {
    registered: catalysts.length,
    realised,
    delayed,
    failed,
    cancelled,
    /**
     * ⚠️ Denominated on **adjudicated** catalysts only. A window still open is
     * not a failure and not a success, and putting it in the denominator makes
     * a young book look like a bad one.
     */
    successRate: adjudicated.length === 0 ? null : round(realised / adjudicated.length, 6),
    delayRate: catalysts.length === 0 ? null : round(delayed / catalysts.length, 6),
    basis: 'catalyst-states-only',
    units: { successRate: 'fraction-of-adjudicated', delayRate: 'fraction-of-registered' },
  }

  const priceLedger = {
    unrealisedReturn: finite(price?.unrealisedReturn) ? round(price.unrealisedReturn) : null,
    realisedReturn: finite(price?.realisedReturn) ? round(price.realisedReturn) : null,
    forwardReturn: finite(price?.forwardReturn) ? round(price.forwardReturn) : null,
    benchmarkExcessReturn:
      finite(price?.forwardReturn) && finite(benchmark?.forwardReturn) ? round(price.forwardReturn - benchmark.forwardReturn) : null,
    components: {
      fees: finite(price?.fees) ? round(price.fees) : null,
      tax: finite(price?.tax) ? round(price.tax) : null,
      dividends: finite(price?.dividends) ? round(price.dividends) : null,
    },
    benchmark: benchmark?.symbol ?? null,
    basis: 'price-and-cash-only',
    units: { unrealisedReturn: 'fraction', realisedReturn: 'fraction', forwardReturn: 'fraction', benchmarkExcessReturn: 'fraction' },
  }

  /**
   * The structural assertion, made here rather than only in the verifier: the
   * two ledgers may not share a key. If a future edit adds `successRate` to the
   * price side, this throws where the edit is instead of drifting into a report.
   */
  const shared = Object.keys(catalystLedger).filter((key) => Object.hasOwn(priceLedger, key) && key !== 'units' && key !== 'basis')
  if (shared.length > 0) throw new Error(`the two ledgers share ${shared.join(', ')}, and the whole point is that they do not`)

  return { data: { catalystLedger, priceLedger, fields: { price: PRICE_FIELDS, catalyst: CATALYST_FIELDS } }, diagnostics }
}
