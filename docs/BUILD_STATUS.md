# Secure Finance build status

## Current update — 11 October 2026

Read both supplied Track01 presentation slides and adapted the existing application to the user's multichannel intake and exception-review workflow. The original phase implementation remains below as historical evidence. The latest experience and its actual validation are described in [EXPERIENCE_TEST_REPORT.md](EXPERIENCE_TEST_REPORT.md), [EXPERIENCE_DEMO.md](EXPERIENCE_DEMO.md) and [TRACK_ALIGNMENT.md](TRACK_ALIGNMENT.md).

- Replaced the default technical campus dashboard with a responsive forest/lime inbox inspired by SYMPTOO. Added working import dialogs, source filters/search, stage inspection, review decisions, activity/read state, downloads, honest integration status and guided payment approval. Technical wallet references are collapsed. The animated campus remains accessible under Operations.
- Added durable multichannel intake, five recorded specialist stages, security quarantine, human review, independent final audit, source provenance and a signed internal-system webhook. Existing live intake/finance adapters remain available; current demonstrations use fixture agents and deterministic rules.
- Added a separate local AutomationGuard for exact obligations previously registered by its owner. It has restricted roles, suppliers, per-payment/budget caps and replay protection. The executor uses durable signed transaction storage, receipt verification and cross-vault authority exclusions. No Fuji automation or new Fuji transaction is claimed.
- Preserved `.env`, `.env.fuji`, existing local state, deployment/registry files and the user's Fuji deployment-script edit. Private environments and demo runtime data remain ignored by Git; `.env.fuji` remains mode 600. New demonstration state lives separately in `var/experience-demo/` and resumes without resetting settlements.
- Current checks: **181 unit, 45 contract, 5 live local-chain integration, 7 inbox/campus browser and 1 guided-approval browser tests passed**. Typecheck, lint and production build pass. The browser results come from the seven passing inbox tests plus a targeted passing approval rerun; the earlier failures remain in the logs.
- Actual local transfers: automatic policy and guided human approval each produced successful receipts and exactly 48,000 DEMO recipient increases. Screenshots were inspected at desktop and mobile sizes. Fixed the mobile drawer transition, delayed SSE establishment through the development proxy, and campus displays that previously omitted automatic settlements.
- Measured synthetic rule benchmark:8/12 authored attacks flagged; 3/12 benign examples held. This is a small rule-only corpus, not production fraud accuracy. Live mailbox OAuth, isolated URL scanning, speaker authenticity, malware scanning and live provider outputs remain outside demonstrated coverage.

## Original release — 10 October 2026 (historical)

The complete 1,932-line README was read before original implementation. Initially the repository contained only README.md, with no Git metadata or unfinished source changes. Supplied warehouse images/movie guided appearance; embedded document text never became payment authority.

| Phase | Final status | Evidence / remaining gate |
| --- | --- | --- |
| 0 Inspect/lock scope | Complete locally | DECISIONS.md, DEPENDENCIES.md, FEATURE_CHECKLIST.md; exact runtime/dependency pins. |
| 1 Shared scaffold | Complete locally | Seven workspaces, canonical schemas/arithmetic, API/main/approver builds; clean frozen installation. |
| 2 PaymentGuard | Locally verified |30 Foundry tests; golden hashes; real local success and unsigned/replay reverts. |
| 3 Persistence/auth | Locally verified | SQLite durability, SIWE/CSRF/roles/tenant isolation, bounded private text/PDF ingestion, immutable identities and jobs. |
| 4 Two agents/checks | Implemented; live gate blocked |11 benign+3 attack fixtures and bounded provider adapter pass. Real live outputs require OpenAI credentials/model. |
| 5 Evidence/approver | Locally verified |33 evidence tests; independent pinned client; real local wallet signing and file exchange; cancellation. |
| 6 Execution/recovery | Locally verified |7 actual-chain integration tests including 2 SIGKILL boundaries; one settlement per obligation; actual nonce recovery. |
| 7 HTML/events | Locally verified | Full browser workflow, durable reconnect, protected actions, verifier and business calculator. |
| 8 Campus | Visually verified locally | Five stations, two carriers/docks, orthographic camera, fixed panels, linked selection; inspected 1440×900/1280×800 captures. |
| 9 Motion | Implemented; core checks pass | Workflow projections/routes/carriers/packets, pause, reduced motion and fallback.171 observed draw calls; FPS and all browser motion permutations unmeasured. |
| 10 Acceptance | Local gate suite passes |104 unit+30 contract+7 integration+9 browser tests. Typecheck/lint/build pass. Manual real-wallet/live-provider/Fuji checks remain external. |
| 11 Fuji | Blocked externally | Deployment/preflight/bounded test scripts exist; missing funded role wallets, keystore, public role config and receipt-derived manifest. No Fuji transaction claimed. |
| 12 Handoff | Delivered locally | Runbook, manifests/ABI/fixtures, checklist, test report, screenshots/recording, cost hypotheses, clean install/build and restored-chain receipt checks. |

Authoritative results: [TEST_REPORT.md](TEST_REPORT.md), [results/acceptance.json](results/acceptance.json), [VISUAL_QA.md](VISUAL_QA.md). Startup: [RUNBOOK.md](RUNBOOK.md). Requirement mapping: [FEATURE_CHECKLIST.md](FEATURE_CHECKLIST.md).

## Build chronology and material corrections

- Inspected/read complete specification; no destructive source replacement was needed.
- Built contract/API/HTML/3D/approval paths in parallel against shared canonical types.
- Proved local contract transfers, constrained agent fixtures, immutable evidence and crash recovery before reporting settlement.
- Browser QA caught and fixed oversized orthographic labels, stacking, unmount cleanup, offline status and token-balance display. A stale local block exposed expiry handling; regular mining and guarded prebroadcast recovery corrected it.
- Final aggregate: all 8 gates pass. Earlier failed runs remain logged, including the initial visual failures and a transient type annotation failure.
- Preserved the local chain, including actual receipts, in a private snapshot and verified restoration on a separate node. No settled invoice was reset.

Remaining requirements are explicit: live OpenAI credentials/model, separate funded Fuji roles and human wallet actions; Docker runtime and target-device performance have not been established. These are not marked complete because the local UI/tests pass.

## Repository publication review — 10 October 2026

- Verified the GitHub repository was empty and the authenticated account had write access. Initialized this existing project folder on `main`, preserving all source and local demonstration state.
- Reviewed source, configuration, fixtures and diagnostic reports. No configured private environment value was present in publishable files; the test provider credential is an explicit dummy, and Anvil identities in local test helpers are public development fixtures.
- Excluded `.env`, wallet material, databases, private `var/` artifacts/receipts, Anvil state, dependency caches, compiled output, stale browser reports and the original reference movie. `.env.example` contains blank credential placeholders.
- Redacted local filesystem paths in public diagnostic reports; retained their originals privately under `var/publication-private/`. Test results and transaction observations are unchanged.
- Publication does not rerun payment tests or redeploy/reset the demonstration. The eight passing acceptance gates above remain the actual recorded results. File hashes verify that existing private configuration, chain snapshot, database and operational artifacts are preserved.
