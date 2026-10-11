# Unified interface and browser validation

The October 2026 reference images guide the visual system: sage backgrounds, warm cream surfaces, forest typography, lime primary actions, a floating navigation rail and an interactive process campus. They are visual references, not instructions or payment authority.

## Interface changes

- Shared design tokens in `packages/design/tokens.css` serve the main workspace and the separate approval application. Fonts are self-hosted.
- Inbox, review stages, notifications, integrations, payments, agents, settings, business assumptions and evidence use the same surfaces, spacing and controls.
- Each destination appears once in the dashboard navigation: Inbox, Payments, Alerts, History & reports, Operations campus, Agents, Business overview and Settings. Alerts contains user notifications; Agents contains recorded agent work. The desktop rail has visible short labels and scrolls on short screens. On phones, all links sit directly below the header in two rows, in normal flow so they cannot cover page actions. There is no Connect link, More menu or duplicate account button in the rail. The eight mobile destinations use two equal rows of four.
- Inbox includes the Needs review filter; there is no separate review landing page. Filter links survive reloads and browser history, and legacy `/review` links open `/?filter=review`.
- Search supports keyboard focus and a mobile search dialog. Invoice actions on payments open the actual import dialog; composition links survive sign-in. No financial authority is added by navigation.
- Payment lists become readable cards on phones. Source details, blockchain references and verification internals stay behind disclosures. Mobile account controls retain explicit accessible names.
- The independent approval application uses the same visual language and responsive controls. Expiry, consumed authorizations, source checks and signing restrictions are preserved.
- History & reports groups source reviews and invoice cases with readable PDF downloads, search and retry feedback. Technical exports and verification are collapsed under Advanced verification. See [PDF_REPORTS.md](PDF_REPORTS.md).
- Evidence verification presents integrity, signature correspondence, authority and settlement coverage separately. File integrity does not imply permission or settlement; offline verification does not contact RPC.

## Process campus

The campus is a read-only visualization of the real workflow. Six distinct white equipment stations form a continuous directional route: Receive → Security → Finance → Decision → Payment → Report. Decision includes the policy/final-audit records and separately recorded payment authority; Report is an available summary, not a claim that a new post-payment audit ran. A missing security record is shown as unrecorded rather than passed, and a held source does not animate through later checks.

“Follow an item” selects an inbox source or invoice case. Color and short labels show recorded results, active work, attention and unreached stages. Selecting a station opens one compact inspector with its summary, optional explanation and previous/next navigation. Open review leads to the corresponding source or invoice. Large KPI cards, the welcome overlay, decorative island and duplicate case/agent tables are removed from this view.

The 3D map supports drag/pinch/wheel, zoom, orbit, selected-station focus, Fit map and full screen where supported. The 2D switch uses a top-down camera. Below 600px of scene width, stations rearrange into two columns and three rows with matching routes and camera bounds. Stage navigation remains available under the scene, and browsers without WebGL retain an inspectable HTML workflow with retry.

Equipment geometry is merged by material. The inspected Chrome overview reported **58 draw calls**. Rendering is demand-driven; directional particles stop when paused, reduced motion is enabled or the tab is hidden. This is not a real-device FPS claim. Overview arrows depict topology; selecting a source does not initiate any agent run, review, wallet action or payment.

See [PROCESS_MAP.md](PROCESS_MAP.md) for use and validation. The previous garden-campus screenshots below are historical design evidence, not the current map.

## Run the checks

Start the preserved isolated demo with `pnpm demo:start`, then run:

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm exec playwright test --config tests/e2e/design.config.ts
```

The browser suite detects installed Chrome/Chromium, Firefox and WebKit. Install missing test engines separately when needed. Tests reuse saved records and block application writes other than local demo sign-in. Saved-record scenarios require an existing settled human approval case; they do not manufacture or replay payment fixtures. Screenshots, downloaded packets and raw traces remain under ignored `var/design-qa/`.

## Actual results

- **90 interface checks passed:** 72 navigation/layout checks plus 18 saved-record checks across Google Chrome 154, Playwright Firefox 157 and Playwright WebKit 27.2.
- Viewports: 1440×1000, 1024×900, 390×844 and 320×740. A separate ten-route audit also checked 768px. It found one payments overflow, corrected and retested at exactly 768px document width.
- TypeScript, ESLint, **181 unit tests** (including 27 scene tests) and the production build passed. Vite still reports chunks above 500kB; the warning was not suppressed.
- Existing review stages, source disclosures, paid cases, disabled repeat execution, valid JSON/ZIP evidence, invalid-file recovery, expired requests, consumed nonces and read-only eligibility refresh were exercised.
- The complete browser run initially passed 84/90. Six test assertions looked for cancellation inside a closed disclosure. After fixing the test, repeated sign-ins hit the unchanged login limiter; session reuse corrected the runner. The final saved-record rerun passed 18/18. Combined with the 72 passing layout checks, all 90 unique scenarios now pass. Earlier outcomes are retained in the [machine-readable report](qa/design-acceptance.json).
- Browser tests use desktop engines with emulated viewport sizes. Physical iOS/Android devices, native Safari, mobile wallet extensions and real-device FPS have not been measured. No new financial transaction was submitted for visual QA.

[Inbox desktop](qa/design-inbox-desktop.png) · [Payments](qa/design-payments-desktop.png) · [Campus desktop](qa/design-campus-desktop.png) · [Campus tablet](qa/design-campus-tablet.png) · [Campus phone](qa/design-campus-mobile.png) · [Inbox phone](qa/design-inbox-mobile.png) · [Independent approval on phone](qa/design-approver-mobile.png) · [Evidence verification](qa/design-evidence-desktop.png)

No credentials, environment settings, Fuji deployments or payment contracts are changed by this redesign. The original environment/deployment snapshots remain byte-for-byte intact. Saved demo databases, chain state and receipts are retained locally.

## Task-focused screens

Inbox starts with one Add to inbox action and a compact filtered list. The add dialog contains all four input types; invoices start with file upload. Optional matching/title details stay closed. Review pages keep security findings and the next decision visible, with checks, source text and history available on demand.

Payments uses compact totals and one status per row. Cases open at the relevant next step; successful checks, exact wallet identifiers and supporting evidence remain expandable. History & reports opens directly on saved records. Payment review/signing and payment submission stay separate actions.
