# openbb-fmp

Price history through an **OpenBB Platform you run yourself**, asking FMP.

## Aumos does not start it, and holds none of its keys

You run `openbb-api` on your own machine; Aumos connects to it. That means your
provider keys live in OpenBB's own settings file and Aumos is given nothing — so
a run using this source carries no secret at all, and an agent with a shell can
use it without anything being put in front of it that should not be.

The cost is a dependency Aumos can neither start nor pin. If the program is not
running, the source fails and the screen says which.

## This document may reach your own computer, and that is a permission

A source specification normally reaches the public internet or nothing:
`localhost` and the private ranges are refused **by name**, because a document
allowed to say them has been handed a key and pointed at whatever else is
listening on your machine.

This one is different and the difference is bounded on four sides:

- it declares itself local, in the open, where you can read it before installing;
- it declares **no credentials**, and the format refuses a local document that
  declares any — so there is nothing for it to carry anywhere;
- it may declare loopback hosts **only**, never a private range and never a
  public host beside them, so it cannot be a bridge between your machine and the
  internet;
- and it does not run until you name it. Set `AUMOS_SOURCE_LOCAL=openbb-fmp`.
  Without that, installing it is not enough and the run is refused by name.

## Why the provider is in this document rather than in a setting

Which provider OpenBB asks decides whether the answer is a restatement. FMP
offers unadjusted bars; the popular free alternative does not, and would hand
back a split-adjusted price for a day before the split with a clean timestamp on
it. A provider that cannot be asked for raw prices cannot honestly serve a past
date at all.

So the provider is pinned here, beside the honesty claim it supports, and both
travel under one digest. **A different provider is a different document** — not a
checkbox, because a checkbox would let the claim and the behaviour drift apart.

## What you supply

Nothing to Aumos. You need `openbb-api` listening on `127.0.0.1:6900` and an FMP
key in OpenBB's own settings.

## Coverage

The venues your FMP plan covers. The free tier answers for US equities and
refuses others with a payment error — which is a fact about your plan rather than
about this document, so the venue list is yours to correct.

## The other half: OpenBB as a library

An agent may also call the historical-price endpoint directly and
receive OpenBB's own response, unmapped:

```
/api/v1/equity/price/historical  ?symbol,provider,interval,start_date,end_date,adjustment
```

Two things about this are worth saying plainly, because they are the opposite of what the
mapped port does.

- **`adjustment` becomes the agent's to set.** The document pins it to `unadjusted` for
  the `market` port on purpose — the paragraph above says why an adjusted bar is a
  restatement wearing a price's clothes — and a relayed call is not that document's
  mapping, so an agent may ask for `adjusted` and get one. It is on the agent, and the
  parameter is listed here rather than hidden so the choice is visible.
- **Nothing is bounded by the instant being judged.** The port filters every row against
  it. This does not.

There is one relayed path and it is the whole list; anything else is refused by name.
