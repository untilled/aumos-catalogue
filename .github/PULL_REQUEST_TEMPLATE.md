<!--
Thank you. `npm run lint` checks everything mechanical; this template is for the
things a person has to answer. Answer in English or Korean — either is read.
Delete any section that does not apply.

고맙습니다. 기계적인 것은 `npm run lint`가 검사합니다. 이 템플릿은 사람이 답해야 하는
것들입니다. 영어로 답하든 한국어로 답하든 상관없습니다. 해당 없는 항목은 지우세요.

한국어 안내: docs/contributing/CONTRIBUTING.ko.md
-->

## What it does · 무엇을 하는가

<!-- One paragraph: how does this agent reason, and what makes that different from
     reasoning bottom-up from an asset, or top-down from a risk budget? This is the
     first thing a reviewer reads and roughly what an investor will see.

     한 문단: 이 에이전트는 어떻게 추론하고, 그것이 자산에서 상향식으로 추론하는 것이나
     리스크 예산에서 하향식으로 추론하는 것과 무엇이 다른가? 리뷰어가 가장 먼저 읽는
     것이고, 투자자가 보게 될 것과 대체로 같습니다. -->

## Lane · 레인

- [ ] `closed` — everything through the Skill Gateway; every input recorded as evidence, bounded by `asOf`
      · 전부 Skill Gateway를 통해서. 모든 입력이 근거로 기록되고 `asOf`에 묶인다
- [ ] `open` — the web and a shell; no evidence, no `asOf` bound, and no broker account on any book it operates
      · 웹과 셸. 근거 없음, `asOf` 경계 없음, 그 에이전트가 운용하는 장부에는 브로커 계좌를 붙일 수 없음

<!-- If open: say why the methodology needs it. The open lane is not a convenience,
     it is a set of guarantees the investor gives up.

     open이라면: 방법론이 왜 그것을 필요로 하는지 적으세요. 열린 레인은 편의가 아니라
     투자자가 포기하는 보장들의 묶음입니다. -->

## Capabilities · 권한

<!-- For each capability in your manifest, one line on what the prompt actually does
     with it. A capability the bundle never uses is a permission granted for nothing.

     manifest의 capability마다, 프롬프트가 그것으로 실제로 무엇을 하는지 한 줄씩.
     번들이 쓰지 않는 capability는 아무것도 아닌 것에 내준 권한입니다. -->

## Whose work is this · 누구의 작업인가

- [ ] Original. I wrote this methodology. · 원본. 내가 쓴 방법론이다
- [ ] A **port** of someone else's work. My manifest carries `provenance`, the original
      notice is in the package, it contains the copyright holder's name, and the commit
      is a full 40-character SHA.
      · 남의 작업을 **포팅**한 것. manifest에 `provenance`가 있고, 원본 고지가 패키지
      안에 있으며, 그 안에 저작권자 이름이 있고, commit은 40자 전체 SHA다

<!-- If a port: link the source, and say what you deliberately left behind. A node a
     port declined has to be distinguishable from one it missed.

     포팅이라면: 출처를 링크하고, 무엇을 일부러 두고 왔는지 적으세요. 포팅이 거절한
     노드는 놓친 노드와 구별될 수 있어야 합니다. -->

## Checks · 검사

- [ ] `npm run lint` passes locally · 로컬에서 통과한다
- [ ] The directory name equals `manifest.json`'s `id` · 디렉토리 이름이 `id`와 같다
- [ ] `version` is bumped if this changes a package that is already published
      · 이미 발행된 패키지를 바꾸는 것이면 `version`을 올렸다
- [ ] Every file is UTF-8 text — no binaries, no symlinks
      · 모든 파일이 UTF-8 텍스트다. 바이너리도 심볼릭 링크도 없다

## Anything else · 그 밖에

<!-- Known limits, market or asset class assumptions, what it is bad at. A package
     that says what it is bad at is easier to trust than one that does not.

     알려진 한계, 시장이나 자산군에 대한 가정, 무엇을 못하는지. 무엇을 못하는지 적는
     패키지가 적지 않는 패키지보다 믿기 쉽습니다. -->
