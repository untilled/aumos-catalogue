import { diagnostic } from './diagnostics.mjs'

function partsAt(instant, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(instant))
  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
}

export function zonedDateTimeToUtc(date, time, timeZone) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}(:\d{2})?$/.test(time)) return null
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute, second = 0] = time.split(':').map(Number)
  const desired = Date.UTC(year, month - 1, day, hour, minute, second)
  let guess = desired
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const parts = partsAt(guess, timeZone)
    const represented = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second)
    const next = guess + (desired - represented)
    if (next === guess) return new Date(next).toISOString()
    guess = next
  }
  const final = partsAt(guess, timeZone)
  const matches = +final.year === year && +final.month === month && +final.day === day && +final.hour === hour && +final.minute === minute
  return matches ? new Date(guess).toISOString() : null
}

function addMinutes(instant, minutes) {
  return new Date(Date.parse(instant) + minutes * 60_000).toISOString()
}

export function nextMarketReview({ sessions = [], asOf, bufferMinutes = 30 }) {
  const diagnostics = []
  const candidates = []
  for (const [index, session] of sessions.entries()) {
    if (!session?.isOpen) continue
    const close = zonedDateTimeToUtc(session.date, session.closeLocal, session.timeZone)
    if (!close) {
      diagnostics.push(diagnostic('market_session_invalid', 'unevaluated', 'Session date, closeLocal and IANA timezone are required', `sessions[${index}]`))
      continue
    }
    const review = addMinutes(close, bufferMinutes)
    if (Date.parse(review) > Date.parse(asOf)) candidates.push({ ...session, closeUtc: close, reviewAt: review })
  }
  candidates.sort((a, b) => Date.parse(a.reviewAt) - Date.parse(b.reviewAt))
  if (!candidates.length) diagnostics.push(diagnostic('next_market_session_missing', 'unevaluated', 'No future open market session is available from the source calendar', 'sessions'))
  return { data: { next: candidates[0] ?? null }, diagnostics }
}

export function earningsCheckpoint(observation, marketSession, config = {}) {
  const diagnostics = []
  const required = ['asset', 'fiscalPeriod', 'announcedDate', 'sourceUrl', 'capturedAt', 'confidence']
  for (const key of required) if (!observation?.[key]) diagnostics.push(diagnostic('earnings_schedule_field_missing', 'blocked', `Missing earnings schedule field ${key}`, key))
  if (observation?.publishedAt && Date.parse(observation.publishedAt) > Date.parse(observation.capturedAt)) {
    diagnostics.push(diagnostic('earnings_schedule_time_invalid', 'blocked', 'publishedAt cannot be after capturedAt', 'publishedAt'))
  }
  const timeZone = observation?.sourceTimeZone ?? marketSession?.timeZone
  let base = null
  const buffer = Math.min(Math.max(config.releaseBufferMinutes ?? 30, 5), 180)
  if (observation?.announcedTime && /^\d{2}:\d{2}(:\d{2})?$/.test(observation.announcedTime)) {
    base = zonedDateTimeToUtc(observation.announcedDate, observation.announcedTime, timeZone)
  } else if (observation?.timing === 'BMO') {
    base = zonedDateTimeToUtc(observation.announcedDate, marketSession?.openLocal, marketSession?.timeZone)
    if (base) base = addMinutes(base, -(config.bmoMinutesBeforeOpen ?? 30))
  } else {
    base = zonedDateTimeToUtc(observation?.announcedDate, marketSession?.closeLocal, marketSession?.timeZone)
  }
  if (!base) diagnostics.push(diagnostic('earnings_checkpoint_unevaluated', 'blocked', 'Cannot normalize checkpoint without valid time and market session timezone', 'announcedTime'))
  const at = base ? addMinutes(base, buffer) : null
  return {
    data: {
      at,
      kind: 'at-time',
      purpose: 'verify-earnings-release',
      timing: observation?.timing ?? (observation?.announcedTime ? 'exact' : 'unknown'),
      sourceUrl: observation?.sourceUrl ?? null,
      capturedAt: observation?.capturedAt ?? null,
      sourceTimeZone: timeZone ?? null,
    },
    diagnostics,
  }
}

export function boundedRetry({ checkpointAt, asOf, attempt = 0, announcedReplacementAt = null }, config = {}) {
  const diagnostics = []
  const maxRetries = Math.min(Math.max(config.maxRetries ?? 2, 1), 4)
  const retryMinutes = Math.min(Math.max(config.retryMinutes ?? 45, 30), 60)
  if (announcedReplacementAt && Date.parse(announcedReplacementAt) > Date.parse(asOf)) {
    return { data: { at: announcedReplacementAt, reason: 'company-announced-replacement', attempt: attempt + 1 }, diagnostics }
  }
  if (attempt >= maxRetries) {
    diagnostics.push(diagnostic('earnings_retry_exhausted', 'unevaluated', 'Bounded retry limit reached; move to next sourced checkpoint', 'attempt', { maxRetries }))
    return { data: { at: null, reason: 'retry-exhausted', attempt }, diagnostics }
  }
  const anchor = Math.max(Date.parse(checkpointAt), Date.parse(asOf))
  return { data: { at: new Date(anchor + retryMinutes * 60_000).toISOString(), reason: 'release-not-yet-published', attempt: attempt + 1 }, diagnostics }
}
