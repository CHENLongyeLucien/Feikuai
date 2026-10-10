# Visual and browser QA

Recorded on 10 October 2026. This report describes the application that was rendered and the checks actually executed. It does not certify every browser scenario in README §14.4.

## Actual rendered application

The desktop application contains a procedural WebGL finance campus with five stations, two supplier docks, two distinct agent carriers, invoice packets, roof seams, windows, doors, road markings, trees and selection brackets. The campus uses an orthographic camera. HTML KPI cards, the inspector, case journey and entity table remain fixed while camera focus changes.

Both desktop overview captures were inspected. The visible campus has cobalt roofs, pale roads and ground, off-white buildings and restrained carrier colors. Camera framing reserves space for the right inspector. Financial actions remain available in the conventional Workspace. Before authentication, private case counters are unavailable rather than fabricated zeroes; the campus remains explorable.

Actual artifacts in `docs/qa/`:

| Artifact | What it records |
| --- | --- |
| `campus-overview-1440.png` | Rendered 1440 × 900 overview and fixed panels |
| `campus-overview-1280.png` | Rendered 1280 × 800 layout |
| `campus-selected-agent.png` | Agent selection and closer camera focus |
| `case-selected-invoice.png` | Uploaded invoice, trusted comparison and actual deterministic checks |
| `attack-01-boundary.png` | Beneficiary replacement held in the HTML case workspace |
| `attack-02-boundary.png` | Forged authority text shown as suspicious source material |
| `approval-exact-terms.png` | Separate approval client inspecting the exported request |
| `execution-observed-after-request.png` | Actual execution preparation observed after the request; no claimed settlement |
| `confirmed-receipt.png` | Receipt-backed settlement shown after reconciliation |
| `campus-confirmed-invoice.png` | Selected settled invoice represented in the campus |
| `cancelled-authorization.png` | Confirmed cancellation shown in the HTML approval lifecycle |
| `actual-payment-workflow.webm` | Recorded main-application browser workflow, including the actual domain transition and campus focus |
| `browser-payment-result.json` | Exact recipient delta, evidence results and captured page errors for the browser payment |
| `camera-diagnostics.json` | Actual camera and renderer observations from the overview |
| `playwright-results.json` | Machine-readable browser test results |

The fixture agents finish quickly. The recording does not demonstrate a long, live-provider carrier work interval. The separate approval tab has its own Playwright recording under the private test-output directory; the main-app recording is not a recording of an actual browser-extension wallet confirmation screen.

## Executed browser checks

The final aggregate browser run passed **9 tests**, with **0 skipped, 0 unexpected failures and 0 flaky tests**, in **56.4 seconds**. Its `playwright-results.json` and `TEST_REPORT.md` are the authoritative final results.

The nine tests cover:

1. A real WebGL canvas, bounded HTML scene labels, agent selection, explicit camera focus/home, pause control, panel clearance at 1440 × 900 and 1280 × 800, and opening/closing the login dialog with Escape.
2. Business-calculator recomputation, including the default 80-customer assumption and the no-positive-contribution case.
3. Initial WebGL unavailability falling back to Workspace while the browser reports reduced-motion preference.
4. The HTML workflow: genuine local SIWE signature, real upload and analysis, request export, separate approver verification and EIP-712 signature, signature import, double-click execution, verified local settlement, exact supplier balance increase, evidence export and verification, then campus/Workspace selection and pause interaction.
5. Both core invoice attack boundaries: beneficiary replacement is held, and forged CFO prose does not provide execution authority.
6. Wrong network during login.
7. Wallet signature rejection during login.
8. A wallet without server membership.
9. Actual wallet `cancelNonce`, observation import and confirmed cancellation, blocked execution, corresponding campus presentation, browser offline/online reconnect, retained cancellation state and actual WebGL context loss falling back to Workspace.

The successful recorded payment in `browser-payment-result.json` increased the supplier balance by **48,000,000,000 atomic units**, or **48,000 DEMO**. Artifact integrity and signature correspondence were `VALID`. Offline settlement remained explicitly `UNVERIFIED_OFFLINE`; that verifier result does not pretend to be a fresh chain-consensus proof. The browser captured no application page errors in the successful workflow.

The injected browser wallet is confined to `tests/e2e/wallet.ts`. It uses the known public Anvil development mnemonic, checks chain 31337 and supplies real cryptographic signatures. This test provider is not imported into either deployable application. It does not substitute for manual inspection of a real wallet's Fuji typed-data display.

## Defects found and corrected

- Initial Drei HTML labels were scaled by an inappropriate `distanceFactor` under the orthographic camera. Their enlarged backgrounds obscured the canvas. The labels now use ordinary screen-pixel sizing. The test checks label bounds to catch this failure again.
- Canvas/label stacking could cover financial overlays. The campus now has an isolated stacking context and fixed overlays have their own layer.
- Camera initialization and framing were made explicit: orthographic camera configuration, immediate initial placement, interruptible focus transitions and a view offset reserving the inspector's width.
- Navigating from Campus to Workspace exposed an HTML-label cleanup error. Labels now target a dedicated DOM portal rather than React-managed Canvas children. The complete workflow checks for application page errors and passes after this correction.
- Pausing or reducing motion during a packet transition previously allowed interpolation to continue. The visual transition now snaps to its authoritative destination and stops. Hidden-page work indicators also stop advancing.
- Supplier delivery previously used one shared endpoint. Packet placement and its highlighted delivery route now resolve the actual recipient against the deployment registry's docks.
- An execution could exist before attempt observations were appended. The workspace now displays the current execution status and error during that interval instead of saying no execution was requested.
- A stale Anvil block timestamp caused an earlier browser payment attempt to expire before broadcast. This was a real failed run, not a successful settlement. Local mining cadence and backend expiry handling were corrected before the passing payment run.
- The public configuration initially queried `balanceOf` on the vault address instead of the token. The backend corrected the target to the token with the vault as the argument; the final confirmed-invoice capture shows the verified 263,999 DEMO balance after the API restart.

## Motion and rendering observations

Scene placement comes from the tested pure projection in `apps/web/src/scene/state.ts`. Verified settlement takes precedence over a later failed attempt. Unknown or inconsistent execution remains visibly unresolved. Cancellation pending differs from confirmed cancellation. A packet travels to a supplier only after the server reports verified settlement.

Packet interpolation and carrier work are visual effects. They do not sign, submit, confirm or otherwise change a financial operation. A reconnect takes an authoritative snapshot rather than replaying historical settlements as new deliveries. The complete payment test runs through Workspace with no campus renderer mounted for the financial steps.

The observed idle overview used **171 draw calls**, an orthographic camera near `[30, 30, 30]`, and zoom about **17.54**. The test environment was **headless Chrome with SwiftShader**, not the team's native GPU presentation environment. Additional packets and selected markers can increase draw calls. Rendering is on demand and device pixel ratio is capped at 1.5.

**FPS was not measured.** The README's approximately 60 fps target and investigation threshold below 45 fps remain performance targets, not achieved measurements. No claim about native-device frame rate is made from the headless screenshots.

## Remaining validation limits

- Live-provider agent calls were not exercised in this browser run. Agent artifacts and UI provenance were explicitly labelled scripted fixtures.
- Manual Fuji wallet display inspection and a genuine Fuji payment require configured, funded testnet role wallets and remain separate from these local browser results.
- The browser suite does not exhaust every expiry/cancellation race, later reverted replay presentation, repeated/out-of-order event sequence, or accelerated-motion financial-equivalence scenario. Pure scene/event tests and backend/contract tests provide separate coverage; they are not additional browser tests.
- Keyboard modal open/Escape behavior was exercised. Exhaustive focus-trap cycling, screen-reader review and the full workflow using only a keyboard were not measured.
- Rotation, pan, wheel zoom, resize and focus controls are implemented. The automated run specifically exercises focus/home and the two recorded viewport sizes; it is not a complete manual camera-usability study.
- The overview and agent-focus captures were visually inspected. The hold captures are HTML workspaces, not a separately recorded close-up of a held packet in the campus.
- No native-GPU FPS, long-session resource/leak measurement, high-DPR device study or fullscreen performance benchmark is claimed.
