# Acceptance report — 10 October 2026

The final combined local acceptance run passed all eight gates. This proves the implemented local demonstration; it does not establish live model performance, a Fuji deployment, production readiness, or manual wallet usability.

## Executed final gates

Executed `node --import tsx scripts/acceptance.ts`, equivalent to the root `pnpm test:acceptance` orchestration. Authoritative machine-readable record: [results/acceptance.json](results/acceptance.json); complete output: [acceptance-run.log](acceptance-run.log).

| Gate | Actual result | Output |
| --- | --- | --- |
| `pnpm typecheck` | PASS | results/typecheck.log |
| `pnpm lint` | PASS | results/lint.log |
| `pnpm test` | **104 passed**, 7 files | results/test.log |
| `pnpm contracts:build` | PASS | results/contracts-build.log |
| `pnpm test:contracts` | **30 passed** | results/test-contracts.log |
| `pnpm test:integration` | **7 passed**, real local chain, 52.6 s | results/test-integration.log |
| `pnpm build` | PASS: main app, independent approver, API, packages | results/build.log |
| `pnpm test:e2e` | **9 passed**, 56.4 s, no skips | results/test-e2e.log |

The 104 unit tests include 42 API/agent tests, 33 evidence/approval tests, exact arithmetic and cross-language hashing, and scene/event projection tests. Foundry additionally ran 256 fuzz cases and an invariant handler with 64 runs / 2,048 calls. These are not live model evaluations. Build warnings identify chunks above 500 kB; no build errors remain.

After this run, the local snapshot helper, launcher persistence flags, Docker approver URL and public environment comments were added for handoff. Full TypeScript/lint were rerun; the snapshot was actually restored and checked; Docker Compose syntax passed. These changes do not alter the tested application/payment paths.

## Financial results

- The final browser workflow used SIWE login, a real uploaded fixture, both persisted agent outputs, a frozen exported request, the standalone approver, an actual EIP-712 test-wallet signature, signature-file import and a double-clicked execution request. Exactly **48,000,000,000 atomic DEMO (48,000 DEMO)** reached the registered supplier. One logical execution produced one verified settlement.
- Final browser transaction: `0xd01a28ba54c1c17e19729f8dbf95d4987a957cd7ff533a8f6d19c3e58a9c414d`; chain 31337, block 551; gas 104611; actual fee 104611000732277 wei. Full record: [browser-payment-result.json](qa/browser-payment-result.json).
- Two process tests actually terminated the API with SIGKILL, respectively after durable raw transaction persistence and after broadcast. Restart used the same database, approval, serialized bytes, transaction hash and account nonce. Each produced one settlement and an exact 48,000 DEMO recipient delta. Records: results/recovery-after-persist.json and results/recovery-after-broadcast.json.
- Real integration also discovered direct contract execution without prior API signature import, rejected mismatched receipts, confirmed cancellation-before-execution, retained settlement when execution won the cancellation race, and kept RPC uncertainty separate from payment.
- The separate protocol test sent1 DEMO successfully and submitted actual unsigned/replay transactions that reverted. This is **actual Anvil execution**, distinct from Foundry simulations and explicit provider mocks. Hashes, deltas and latency: [local-chain-results.json](local-chain-results.json).
- The documented nonce recovery CLI was actually used after an expired, unbroadcast browser-test attempt. Its zero-value self-transfer `0xcc04e04594cbe9f0c999a644a794ab07a1478af897913031711c5ddfbd72b330` cleared only the relayer queue. It was not a payment. See nonce-recovery-*.log.
- Offline evidence verification reports valid artifact/signature correspondence and independently pinned signer eligibility, while correctly leaving settlement `UNVERIFIED_OFFLINE`. Online verification independently finds the matching local chain receipt/event/consumption. See evidence-offline-results.log and evidence-online-results.log. Invalid/tampered/missing/path-traversal/oversized/decompression cases are tested; untrusted bundle configuration alone never establishes signer eligibility.

## Agents and attacks

All 11 benign fixture variants pass hard business checks. ATTACK-01 substitutes a recipient and is held. ATTACK-02 forges CFO prose and ATTACK-03 embeds agent/tool-shaped instructions; both retain source provenance and acquire no signature or payment capability. Browser tests visibly cover ATTACK-01 and ATTACK-02; ATTACK-03 is in deterministic agent/API tests.

Both agents have a real Responses API adapter with strict schemas, versioned prompts, bounded calls, repair/refusal handling and persisted request/tool/usage artifacts. Intake has no tools; Finance has three server-scoped read-only tools. Injected-provider adapter tests exercise budget, schema, refusal and scope enforcement. **No live OpenAI calls ran**, because no key/model was configured. No claim of a successful live prompt injection or model resistance follows from fixtures.

## Browser and visual observations

The 9 browser tests cover the complete HTML payment/file flow, exact real token delta, evidence export, two attack boundaries, wrong network, wallet rejection, nonmember wallet, real cancellation observation/confirmation, offline/reconnect, actual WebGL context loss, unavailable WebGL, reduced-motion preference, keyboard modal dismissal, viewport panel clearance, selection/focus/pause, and the business calculator.

Actual screenshots at1440×900 and1280×800 were inspected. The overview contains five stations, two supplier docks, roads, landscaping, invoice packets and two agent carriers; overlays stay fixed. Captures and the actual 1.4MB workflow recording are linked in [VISUAL_QA.md](VISUAL_QA.md). The observed overview uses171 draw calls in headless Chrome with SwiftShader. Target-device FPS, GPU memory, full keyboard audit and accessibility audit remain unmeasured. State tests cover expiry/unknown/cancellation/replay truth and duplicate/out-of-order events. Full browser permutations of accelerated animation, expiry and reverted replay are not separately claimed; the actual payment ran through Workspace without requiring a mounted 3D scene.

## Reproduction and restart evidence

- A clean isolated copy installed 360 locked packages successfully with `pnpm install --frozen-lockfile`; a fresh build passed and native SQLite returned a real in-memory query. See fresh-install-results.log and fresh-build-results.log.
- The compiled API started on a real loopback listener with a fresh private database; health and unauthenticated session checks passed: api-build-smoke.json.
- `docker compose config --quiet` passed. Docker daemon was unavailable, so an actual Linux image build, nginx workflow and persistent Docker-volume restart were not run.
- A private local-chain snapshot was restored on a separate port. Code hash, exact263,999 DEMO vault balance and all three browser-settlement receipts/digests matched. See [local-restore-results.json](local-restore-results.json).
- Initial vault funding was 300,000 DEMO. Early integration tests and browser retries consumed real local tokens; subsequent integration runs use isolated deployments. A further 300,000 valueless DEMO was transferred from the local test deployer for repeat acceptance/handoff, without resetting obligations. See local-refunding-results.json.

## Defects found and corrected

Early browser runs found oversized orthographic HTML labels, label stacking/unmount cleanup, delayed offline status and the vault KPI querying the wrong contract. Visual inspection caught the render failure even when interaction tests passed; label-size assertions now cover that regression. A stale idle Anvil block also made an approval expire at gas estimation. The launcher now mines every second; deterministic prebroadcast failures are decoded, redacted and can release only proven unsigned reservations. Signed transaction envelopes remain durable. The backend also closes SSE streams before shutdown and prevents an in-flight signature import from overwriting cancellation.

An early unit run had a long timeout that did not reproduce. Prior failures remain in earlier logs and acceptance-before-final.json. The final aggregate has zero failed gates. No failure was reclassified as a successful transfer.

## Unrun external gates and measurements

| Item | Actual state / prerequisite |
| --- | --- |
| Live Intake and Finance runs | NOT RUN. Server-only OPENAI_API_KEY, account-available OPENAI_MODEL, AGENT_MODE=live required. |
| Fuji deployment/payment/negative transactions | NOT RUN. Five distinct public role addresses, encrypted deployer keystore, dedicated relayer secret, test AVAX, deployed/funded DEMO vault, public manifest and pinned approval build required. Attempted preflight scripts report blockers. |
| Human wallet display and review | NOT RUN. Browser uses a test-only injected local wallet, not a person inspecting an extension. Human signing/cancellation and display inspection required for Fuji. |
| Model token cost / live latency | Unmeasured. Fixture requests are 0; mocked usage is test data. No dated price schedule configured. |
| Human review/support/acquisition costs | Unmeasured. Business calculator values are hypotheses; no customers or revenue claimed. |
| Transaction latency | Single local protocol sample 4,007.95ms to receipt; not a Fuji latency estimate. |
| Performance |171 draw calls observed; target-hardware FPS/memory unmeasured. |
| PDF worker exhaustion; pre-raw SIGKILL | Bounds and unsigned-reservation logic implemented/tested in isolation; separate resource-exhaustion and third real process-kill experiments not run. |

The complete external configuration and startup sequence are in [RUNBOOK.md](RUNBOOK.md). This is a synthetic local/Fuji demonstration, not a production treasury release.
