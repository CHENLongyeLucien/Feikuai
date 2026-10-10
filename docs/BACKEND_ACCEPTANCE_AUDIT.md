# Backend implementation and acceptance audit

Observed 2026-10-10. This is the backend contributor's audit; the aggregate `TEST_REPORT.md` and browser/chain logs record the final integrated run.

| README scope | Implemented evidence | Executed validation |
| --- | --- | --- |
| Phase 3: durable identities/access | SQLite/Drizzle schema, WAL/FULL, reviewed registry, random stable invoice keys, private durable blobs, exact SIWE challenges, hashed sessions, roles/tenants, CSRF, revisions, transactional idempotency and jobs | API unit tests cover restart, replay/expiry/wrong wallet/origin, roles, stale versions, cross-tenant reads and concurrent duplicate upload |
| Phase 4: two agents | Bounded OpenAI Responses adapter and separately labelled fixture adapter; strict structured output; 0 Intake tools and 3 scoped Finance tools; provider attempt/usage/tool artifacts; current-record deterministic gate | All 11 benign variants and 3 attack fixtures; injected provider adapter budget/refusal/schema/tool tests; missing live credentials produce explicit failure, never fallback |
| Phase 5 backend: evidence and approval lifecycle | Artifact inventory and frozen proposal through shared evidence package, outstanding packet protection across cases, signature recovery and deployment/current-chain checks, authenticated private exports | Real ECDSA signatures in isolated tests; concurrent freezes; revised outstanding packet; pending cancellation cannot be overwritten by sequential or in-flight signature import |
| Phase 6: relayer/recovery | Serialized nonce reservation, exact simulation, locally signed raw bytes durably stored before broadcast, receipt/calldata/event/transfer predicate, bounded event scanning, direct external execution, cancellation/expiry, recovery CLI | Integrated local Anvil suite validates external payment, wrong receipt, cancellation race and RPC failure; root process suite validates real termination after persistence and after broadcast |
| Phase 7 backend: API/events | Required routes plus execution status; paginated tenant-scoped cases; consistent bootstrap; durable cursor SSE with heartbeat, replay/snapshot recovery and session checks | API unit tests and browser workflow integration; active SSE responses close in Fastify preClose to allow shutdown |
| Phase 12 packaging | `@secure-finance/api` workspace metadata; compiled Node ESM API; persistent Docker volume; same-origin nginx; local Docker origins/RPC override and fresh-volume seed | `docker compose config --quiet` passes; isolated compiled-bundle Fastify injection returns healthy and unauthenticated session; Docker build/start itself unrun |

## Actual backend command results

- `node node_modules/vitest/vitest.mjs run tests/api --reporter=verbose`: **42 passed**, 2 files; `backend-unit-results.log`. The config regression verifies `balanceOf(vault)` targets the pinned token contract and preserves an amount above the JavaScript safe-integer range as a decimal string.
- `node node_modules/typescript/bin/tsc --noEmit`: passed after the execution failure fix.
- `node node_modules/eslint/bin/eslint.js apps/api tests/api scripts/relayer-recover.ts`: passed after the execution failure fix.
- `node scripts/api-build-smoke.mjs`: passed; `api-build-smoke.json`. This uses injection of the compiled bundle, not a listening socket or a Docker container.
- An earlier aggregate run's anomalous close-hook timeout was not reproduced in focused tests (about 2–3 seconds total). Active SSE responses now end during preClose; no claim that the environmental timeout's origin was proved.

## Observed browser execution failure and correction

The first browser payment did **not** settle. Local Anvil's last executed block was stale; approval issued/deadline were derived from that actual block, and the pending transaction timestamp was already beyond the deadline. `estimateGas` returned `ApprovalExpired()` before any raw transaction was signed or broadcast. The former generic exception handling incorrectly labelled it UNKNOWN and retained an unsigned reservation.

The adapter now decodes controlled contract-error codes and never persists arbitrary RPC error messages that could include signed calldata. Before-broadcast failures record NONE when absence of a transaction and release of its reservation are established. An unsigned RESERVED row is released only when it has no raw transaction, hash or recovery envelope, matches the pinned relayer/chain, and both latest/pending account nonces equal the reserved nonce. A durable attempt observation preserves the released reservation identity. Signed envelopes are never removed by this path. Uncertain account state keeps the reservation and an explicit UNKNOWN observation.

Four isolated RPC regressions cover expiry at estimation, external pending nonce uncertainty, protection of persisted signed bytes and error-text redaction. The parent agent separately executed the explicit nonce recovery CLI against the original main-demo reservation; its actual dry-run/broadcast/receipt logs are `nonce-recovery-*.log`. The zero-value recovery transaction is not a payment settlement. The local Anvil launcher now mines regularly so new review packets have a current executed-chain timestamp.

## Pending external or unexecuted checks

- **Live model acceptance:** supply a server-side `OPENAI_API_KEY` and an account-available `OPENAI_MODEL`, explicitly select `AGENT_MODE=live`, then record both agents' real outputs, usage and timing. Injected provider tests are not live model results.
- **Fuji:** separate deployment, approver, relayer and supplier addresses; protected deployer keystore; test AVAX for deployment/relayer and approver cancellation; actual DEMO deployment/vault funding; pinned manifest and rebuilt approver. The API has no approver private key or signing endpoint. Human approval/cancellation must occur in the approver wallet.
- **Docker runtime:** configuration validation and compiled API smoke passed. An actual image build, native Linux SQLite load, persistent-volume restart and nginx SIWE browser workflow remain unexecuted unless later aggregate logs supersede this audit.
- **Additional extraction edge cases:** valid text PDF, encrypted PDF, PDF without selectable text, page-count limit, PDF/text character cap, raw byte cap, corrupt/type mismatch and invalid UTF-8 were tested. Worker memory/timeout termination is implemented but resource-exhaustion fault injection was not run.
- **Before-raw process boundary:** guarded reserved-nonce recovery has isolated tests, but the two executed process-kill tests were after persistence and after broadcast. A dedicated real process-kill before raw persistence was not yet run at this audit time.
- Human review time and full interface performance must be measured in the browser; backend provider usage, timestamps, transaction gas and charged fee are recorded but are not substitutes for those measurements.
