---
name: financial-capital-headroom
description: How a bank or bank-led financial holding company's return capacity is measured — CET1 against the issuer's own policy target, ROE, credit costs and property project-finance exposure — and why an insurer or a securities firm is classified and then left unevaluated. Load when the candidate is a financial of any kind.
---

# The capital a return is paid out of

## First: which kind of financial, and on what evidence

⛔ **«It is financial» does not select this arithmetic; «it is a bank» does.** State the issuer kind
as one of `bank`, `insurance`, `securities` or `unclassified`, and state the disclosure or business
report you read it off in `classification.basis`. A financial holding company is `bank` only when
what it consolidates is a bank; a group whose principal subsidiary is an insurer or a broker is not.

⛔ **`insurance`, `securities` and `unclassified` stop here, explicitly.** An insurer's solvency is
measured by K-ICS and a securities firm's by the NCR. Those are different ratios answering different
questions, and how much is distributable under each has to be worked out separately.
`capitalHeadroom` returns `unevaluated` naming the ratio that would answer it, and that is the
answer you carry: a wait with a reason. **Do not put a K-ICS or an NCR figure into the `cet1`
slot.** Handing in a `cet1` for a non-bank is refused outright, and the refusal is recorded as *this
run read the wrong number*.

⚠️ **Say `consolidated` or `standalone` in `classification.consolidationBasis`.** A holding
company's consolidated CET1 and its banking subsidiary's standalone ratio are two numbers about two
entities, and a headroom quoted without saying which is one a reader cannot check. It does not
refuse the case; it is reported wherever the capital position is quoted.

## Then: the arithmetic, for a bank

A bank does not pay a dividend out of profit. It pays it out of capital it is allowed to stop
holding, and the amount it is allowed to stop holding is the gap between the ratio it runs at and
the ratio it has promised — to its regulator and, separately and usually higher, to the market.

```
headroomRatio        = cet1 − policyTargetCet1
distributableCapital = headroomRatio × riskWeightedAssets
returnHeadroomYield  = distributableCapital / marketCap
```

⚠️ **The policy target, not the regulatory minimum.** An issuer that has told the market it runs
at 13% has 13% as its floor whatever the supervisor permits. Sizing a programme out of the gap to
the regulatory minimum is spending capital the issuer has already promised not to spend, and the
first bad quarter is when the market discovers you did.

`capitalHeadroom` computes this. It needs `cet1`, `policyTargetCet1`, `riskWeightedAssets` and
`marketCap`, and if any is absent the answer is `unevaluated` — an absence, never a conclusion that
the capital is not there.

## The other three numbers, and what each of them is for

- **ROE against cost of equity.** This is the question of whether the discount is deserved. A bank
  earning 6% on equity that costs 10% is *correctly* valued below book, and no return programme
  fixes that: it is returning capital because it cannot earn on it. The thesis you can hold is the
  one where ROE is at or approaching the cost of equity **and** the discount is about something
  else — a governance discount, a policy uncertainty, a peer-group de-rating.
- **Credit cost.** Compare against the issuer's **own** guidance, not against a number this
  package carries. Running above guidance does not refuse the programme; it is where next
  quarter's headroom goes, and it is what the bear case is about.
- **Property project-finance exposure.** State it as a share of the loan book with a date on it.
  It belongs in the bear case as a number, not as a mood — a bear case that says "PF risk" and
  quantifies nothing cannot be refuted and therefore cannot be checked later.

## Where the figures come from

OpenDART carries the quarterly and annual statements, the capital adequacy disclosures and the
dividend resolutions. The issuer's own IR material carries the policy target and the return-ratio
guidance, and that is a **web reading**: file it through the supported observation route with its
URL and publication date, and grade it as this manager's testimony. A policy target you remember
is not evidence.

## What this skill refuses

⛔ **These ratios are not read for a non-financial.** `capitalHeadroom` blocks a `cet1` handed in
for an industrial, and the run records that as its own mistake — `research_incomplete` — rather
than as a capital finding about the company. If you are unsure which the issuer is, the test is
what its balance sheet is made of: an entity whose assets are loans and securities funded by
deposits or policy reserves is judged here; an entity whose assets are plant, inventory and
receivables is judged in `nonfinancial-cash-headroom`. A holding company is judged on the
consolidated group its capital ratio is reported for.
