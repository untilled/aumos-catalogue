<!--
Thank you. `npm run lint` checks everything mechanical; this template is for the
things a person has to answer. Delete any section that does not apply.
-->

## What it does

<!-- One paragraph: how does this agent reason, and what makes that different from
     reasoning bottom-up from an asset, or top-down from a risk budget? This is the
     first thing a reviewer reads and roughly what an investor will see. -->

## Lane

- [ ] `closed` — everything through the Skill Gateway; every input recorded as evidence, bounded by `asOf`
- [ ] `open` — the web and a shell; no evidence, no `asOf` bound, and no broker account on any book it operates

<!-- If open: say why the methodology needs it. The open lane is not a convenience,
     it is a set of guarantees the investor gives up. -->

## Capabilities

<!-- For each capability in your manifest, one line on what the prompt actually does
     with it. A capability the bundle never uses is a permission granted for nothing. -->

## Whose work is this

- [ ] Original. I wrote this methodology.
- [ ] A **port** of someone else's work. My manifest carries `provenance`, the original
      notice is in the package, it contains the copyright holder's name, and the commit
      is a full 40-character SHA.

<!-- If a port: link the source, and say what you deliberately left behind. A node a
     port declined has to be distinguishable from one it missed. -->

## Checks

- [ ] `npm run lint` passes locally
- [ ] The directory name equals `manifest.json`'s `id`
- [ ] `version` is bumped if this changes a package that is already published
- [ ] Every file is UTF-8 text — no binaries, no symlinks

## Anything else

<!-- Known limits, market or asset class assumptions, what it is bad at. A package
     that says what it is bad at is easier to trust than one that does not. -->
