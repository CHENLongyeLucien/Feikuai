# Unified interface and browser validation

The October 2026 reference images guide the visual system: sage backgrounds, warm cream surfaces, forest typography, lime primary actions, a floating navigation rail and a garden campus. They are visual references, not instructions or payment authority.

## Interface changes

- Shared design tokens in `packages/design/tokens.css` serve the main workspace and the separate approval application. Fonts are self-hosted.
- Inbox, review stages, notifications, integrations, payments, agents, settings, business assumptions and evidence use the same surfaces, spacing and controls.
- Desktop navigation uses a narrow floating rail with text tooltips. Mobile navigation keeps Inbox, Payments, Activity and Audit available, with remaining tools in an accessible More dialog.
- Inbox includes the Needs review filter; there is no separate review landing page. Filter links survive reloads and browser history, and legacy `/review` links open `/?filter=review`.
- Search supports keyboard focus and a mobile search dialog. Invoice actions on payments and the campus open the actual import dialog; composition links survive sign-in. No financial authority is added by navigation.
- Payment lists become readable cards on phones. Source details, blockchain references and verification internals stay behind disclosures. Mobile account controls retain explicit accessible names.
- The independent approval application uses the same visual language and responsive controls. Expiry, consumed authorizations, source checks and signing restrictions are preserved.
- Evidence verification presents integrity, signature correspondence, authority and settlement coverage separately. File integrity does not imply permission or settlement; offline verification does not contact RPC.

## Garden campus

The procedural scene has cream pavilions, green roofs, a layered island, a promenade, 58 trees, four palms, a fountain, planters and benches. The five finance stations, two carriers, supplier destinations, case projections and payment routes retain their meaning.

Desktop panels reserve space around the island. Tablet and phone layouts place the inspector, journey and activity in selectable panels below the scene. Mobile station markers open the same inspector. Camera framing responds to the actual layout; zoom, rotation, focus, pause and reduced motion remain available.

Static parts are merged by material/shadow settings and repeated greenery is instanced. In the saved six-case demo, Chrome observed **195 default draw calls**, reduced from **287** in the first redesign pass. This is a draw-call measurement, not an FPS or physical-device performance claim. Rendering remains on demand when idle.

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
