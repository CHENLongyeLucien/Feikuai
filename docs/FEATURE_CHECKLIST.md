# Requirement and acceptance map

This maps mandatory README families to implementation and executable evidence. A test filename denotes coverage, not a claim that the latest run passed; consult TEST_REPORT.md and results/acceptance.json for actual outcomes.

| README requirement | Implementation | Acceptance / evidence |
| --- | --- | --- |
| Exact canonical wire values and six-decimal amounts | packages/shared/src | tests/shared/values.test.ts |
| Stable obligation identity across uploads/revisions | API db/seed, domain/service | tests/api/backend.test.ts; recovery suite |
| Immutable token, approver, sorted registry, cap, TTL | contracts/src/PaymentGuard.sol | contracts/test/PaymentGuard.t.sol |
| EIP-712 every signed field and domain binding | chain package, PaymentGuard | Solidity mutation/policy tests; chain golden tests |
| Replay, two nonce race, cancellation, expiry | PaymentGuard consumed mappings | Solidity tests; real integration cancellation races |
| Exact token delta, failure rollback, reentrancy | PaymentGuard balance checks | Foundry malicious token/fuzz/invariant tests |
| Real local transfer, actual negative transactions | scripts/chain-local-test.ts | docs/local-chain-results.json |
| Migrations, WAL/FULL, foreign keys, durable jobs | apps/api/src/db and jobs | API persistence tests; process recovery tests |
| SIWE, session binding, expiry, CSRF, roles, tenant isolation | apps/api/src/security/auth.ts | tests/api/backend.test.ts |
| Private bounded text/PDF ingestion and provenance | apps/api/src/security/artifacts.ts | tests/api/agents.test.ts; backend input-limit tests |
| Two strict agents and versioned prompts | apps/api/src/agents | adapter/schema/repair/refusal/budget tests |
| Three server-scoped read-only Finance tools | agents/runner.ts | tool budget and invented capability tests |
| Live/fixture separation and actual usage artifacts | runner + persisted agent runs | fixture/provider-mock tests; live provider pending credentials |
| Independent business facts/source/version checks | domain/checks.ts | 11 benign + 3 attack fixture expectations |
| Noncircular JCS manifest and exact-byte commitment | packages/evidence | tests/evidence/evidence.test.ts |
| Bounded archive, paths, completeness and checksums | packages/evidence | tests/evidence/hardening.test.ts |
| Outstanding exported authority after revision | domain/service.ts | concurrent freeze, REVISION-02 API tests |
| Independent file-based approval, pins and registry | apps/approver | mocked RPC eligibility tests; real browser workflow |
| Wallet signing, refusal, wrong wallet/network | apps/approver; main SIWE login | E2E workflow; manual extension display pending |
| Cancellation observation and execution race | approver + API chain reconciliation | real local CANCEL-01/CANCEL-02 integration |
| Persist signed raw transaction before broadcast | apps/api/src/jobs/worker.ts | actual SIGKILL recovery-after-persist |
| Ambiguous broadcast and nonce ownership | worker + relayer-recover script | actual SIGKILL recovery-after-broadcast; RPC outage integration |
| Full receipt/calldata/event/consumption predicate | apps/api/src/jobs/chain.ts | external discovery and forged-receipt integration |
| Atomic unique settlement projections | db constraints and chain service | repeat scanner + one balance delta per recovery case |
| Durable SSE snapshot/replay and visual deduplication | API routes; web app/events.ts | API tests; tests/scene/state.test.ts; browser reconnect |
| HTML routes and complete payment workflow | apps/web/src/app and features | tests/e2e workflow |
| Evidence offline and pinned online verification | scripts/evidence-verify.ts | recorded offline/online CLI results; tamper tests |
| Five stations, roads, docks, landscaping, real meshes | apps/web/src/scene/CampusCanvas.tsx | browser WebGL tests and actual QA captures |
| Orthographic controls and selection across panels | CampusCanvas + Zustand UI store | campus browser test, selected captures |
| Truthful hold/expiry/unknown/cancelled/settled placement | scene/state.ts | tests/scene/state.test.ts |
| Carrier/packet paths, pause, reduced motion | CampusCanvas | browser motion checks; pure financial projection parity |
| WebGL loss fallback and keyboard dialogs | app error boundary and workspace | campus E2E |
| 1280×800 / 1440×900 fixed-panel composition | web styles | bounding-box assertions and inspected screenshots |
| Pricing/volume/labor/CAC/churn calculator | features/business/Business.tsx | browser recomputation and no-positive-contribution test |
| Actual usage/fees, no invented revenue | persisted agent runs; chain results; business page | TEST_REPORT measurement table; live/human costs unmeasured |
| Guarded Fuji deployment, role separation and DEMO | deploy-fuji, chain-preflight, chain-fuji-test | executable blockers recorded; funded wallets required |
| Reproducible startup, independent builds, hosting config | lockfile, build, Dockerfile, compose.yaml | build and frozen-install checks; Docker daemon unavailable |
| Public handoff and production limits | RUNBOOK, BACKEND_SECURITY, CONTRACTS, DECISIONS | final phase matrix and report |

The local browser wallet is test-only and must remain under tests/. It uses publicly known Anvil credentials, not a server-held human approver key. Do not infer live-model robustness from fixture outcomes or Fuji performance from local measurements.
