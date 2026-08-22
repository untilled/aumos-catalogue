# Toss Securities

Toss Securities' Open API, relayed without reshaping the vendor response.

## What you get

This source exposes the declared read-only endpoints for candles, investor trading,
short selling, and exchange rates at `openapi.tossinvest.com`. Responses are not
bounded by `asOf`; agents are responsible for their own point-in-time discipline.

## What you supply

A Toss Securities client id and client secret. Both are required to create the live
OAuth session used for every request. Aumos stores them in the system keychain and
does not expose them to agents.
