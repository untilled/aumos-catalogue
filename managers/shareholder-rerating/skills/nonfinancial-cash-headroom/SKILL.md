---
name: nonfinancial-cash-headroom
description: How a non-financial company's return capacity is measured — operating cash flow after maintenance capex and committed investment, leverage against a declared ceiling, and the working-capital swing a return programme has to survive. Load when the candidate is not a financial.
---

# The cash a return is paid out of

An industrial pays a dividend out of cash it still has after doing the things it cannot skip.

```
freeCashAfterInvestment = operatingCashFlow − maintenanceCapex − requiredInvestment
returnCoverage          = freeCashAfterInvestment / plannedReturnCash
leverage                = netDebt / ebitda
```

`capitalHeadroom` computes this and refuses a coverage below 1: a return larger than the cash left
after necessary investment is paid out of the balance sheet, which is a distribution and not a
programme a thesis can rest on.

⚠️ **`requiredInvestment` is separate from maintenance capex and it is the number that matters.**
What kills an industrial's dividend is not the machine it replaces every year — it is the plant,
the yard or the fab it has already committed to build. Find the commitment in the filings and the
board resolutions, put a figure and a schedule on it, and if you cannot, say so: this package
reports "measured after maintenance capex only" rather than quietly treating an unstated
commitment as zero.

## Three things to check that the arithmetic does not

- **Where the operating cash flow came from.** A year of cash released by working capital is a year
  of cash, not a rate. Look at the change in receivables, inventory and payables; a return
  programme sized on a working-capital release is sized on a one-off.
- **Whether the earnings behind it recur.** Asset disposals, insurance recoveries, one-off
  provision reversals and foreign-exchange gains all land in pre-tax profit. `classifyCase` will
  refuse a payout that is comfortable on reported earnings and above 1 on recurring earnings; your
  job is to produce the recurring figure honestly rather than to reach a comfortable one.
- **The leverage ceiling and who set it.** A covenant, a rating agency threshold or the issuer's
  own stated target. Debt reduction has first claim on the cash, and a return programme competing
  with a deleveraging commitment is the one that gets cut.

## Cyclicals, which is where this goes wrong

A shipbuilder, a chemical producer or a memory maker at the top of its cycle shows enormous free
cash, a tiny payout ratio and a low multiple, and every one of those numbers is a description of a
peak. Two questions keep this desk out of that trap:

1. What does the coverage look like on **mid-cycle** earnings rather than on the last twelve
   months? Write the mid-cycle figure and say how you got it.
2. Is the return policy expressed as a **ratio of profit** or as an **absolute amount**? A ratio
   falls with the cycle by design and is not a promise about cash; an absolute floor is a promise
   and is the one to check against a downturn's cash flow.

Neither question has a threshold in this package. Both belong in `contraryEvidence`, in numbers.
