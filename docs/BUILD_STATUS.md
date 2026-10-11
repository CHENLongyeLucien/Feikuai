# Secure Finance build status

## Simpler workflow and 10 DEMO tests — 11 October 2026

Removed Connect from desktop/mobile navigation. Inbox now has one Add to inbox action, compact filters and a single search. The dialog offers Invoice, Email, Voice and Text together, starts invoice uploads with a file picker, and keeps optional metadata closed. Removed repeated hero/summary/process cards. Review pages emphasize the next action and security findings; source text, passed checks, history and technical evidence are expandable. Payments uses compact totals and one outcome per row; cases open on the relevant review/result step. Reports and agent/settings pages use shorter introductions.

Prepared 20 new, distinct trusted invoices, NS-TEST10-0001 through 0020, at 10.00 DEMO in the existing Fuji, original local and saved experience-demo registries/databases. Private backups were created before appending. All pre-existing database tables/rows and registry records were compared before/after and preserved. Environment/chain files are unchanged and ignored; Fuji environment remains 0600. No contract deployment, approval signature or payment was performed. The running Fuji approver was reloaded and its public pins include the new records. Existing 48,000-DEMO records and exact standing-policy obligations retain their history and terms.

Fresh seeding defaults to 10 DEMO; source generation derives the exact registered amount. Demo suggestions choose unused 10-DEMO human-approval invoices, never a 48,000-DEMO fallback. Added idempotent dry-run preparation with identity-conflict rejection, backups and crash retry. Twenty clean text invoices are included in `fixtures/user-tests/small-payments/`. The five scenario PDFs use new references at 10 DEMO, with 11 DEMO only for the deliberate amount mismatch. The 48-file test archive was rebuilt and checked.

Validation: **203 unit/API tests passed**, TypeScript, ESLint and production build passed (existing large-chunk warnings remain). **48 navigation/layout checks passed** across Chrome, Firefox and WebKit at 1440, 1024, 390 and 320px. All 20 source-review scenario checks and all 20 clean 10-DEMO source/registry comparisons pass. All five PDF pages were rendered and visually inspected. Database preparation was verified idempotent in each workspace; private configuration and prior payment records were preserved. An additional **27 focused intake/review/error-state checks** and **6 saved-record review/payment checks** passed across the same three browser engines, for **81 final browser checks**. The saved-record checks verified that settled invoices cannot be submitted again. Legacy mutating inbox/approval acceptance selectors were updated but those payment suites were not rerun.

The preview uses a copied database with workers/seeding disabled. Browser checks block application mutations except local demo login. No new live-provider, transcription, wallet or settlement result is claimed. Raw logs and screenshots are under ignored `var/ux-simplification-qa/` and `var/simplified-inbox-qa/`. Earlier focused browser checks hit the demo sign-in rate limit; session reuse fixes the test harness without weakening the application's limit. A saved-record test also used a removed CSS selector; it was updated to the visible source disclosure and all six checks then passed. Original unrelated Fuji deployment changes remain outside this commit.

## Manual input test pack - 11 October 2026

Added `fixtures/user-tests/` with five selectable-text invoice PDFs, five email messages, five voice transcripts with matching synthetic WAV recordings, and five pasted-text examples. A guide and spreadsheet checklist describe the intended clean, incomplete, financial-mismatch and security-hold scenarios. `fixtures/user-test-pack.zip` packages all 28 files. The invoice examples avoid the five standing-policy demo obligations; no source includes a wallet destination or credentials.

Validation: all **20 offline source checks passed** using the application's extraction, classification, security and finance functions, with an explicitly assumed fresh unpaid projection for the clean invoice. All five PDF pages were rendered and visually inspected, all five EML files passed MIME checks, and all five PCM WAVs are structurally valid and non-silent. TypeScript and focused ESLint passed. The ZIP entry count and CRC checks passed. An existing raw-email-header classification limitation was found and documented in the pack; no application behavior was changed.

This task did not import test items, run live transcription/model calls, seed or reset a database, sign approvals or submit payments. Existing environments, local demo state and unrelated Fuji edits remain untouched. See `fixtures/user-tests/VALIDATION.md` for actual scope; offline rule projections are not end-to-end payment acceptance results.

## Direct dashboard navigation — 11 October 2026

Removed the More / “…” button and dialog. Each of the nine destinations now appears once in the navigation, including direct access to Agents, Business and Settings. The desktop rail includes short visible labels; Alerts and Agents have distinct names. Removed the extra rail account button while retaining the header account controls. On phones, all links appear below the header in two rows, in normal flow so navigation cannot cover review or payment actions. Short desktop rails scroll, with keyboard focus kept visible.

Validation: **36 focused browser scenarios passed** across Chrome, Firefox and WebKit at 1440×1000, 1024×900, 390×844 and 320×740. They exercise every direct route, the active destination, search, settings and campus preferences. **Nine additional keyboard/layout checks passed** at 1024×500, 768×420 and 760×420, including 44px minimum targets, visible-label/accessibility-name correspondence and short-rail scrolling. The initial WebKit keyboard check expected plain Tab to visit links; the final check uses macOS WebKit's Alt+Tab link-navigation shortcut. Initial and final logs remain under ignored `var/navigation-qa/`. Inspected desktop and narrow-phone screenshots. TypeScript, focused ESLint and the production build passed; existing chunk-size warnings remain.

The preview used a copied demo database, with workers and seeding disabled. Browser checks blocked data mutations other than local demo sign-in. No financial execution or contract suite was rerun. Original environments, saved demo chain/database/receipts and unrelated Fuji work remain unchanged. Updated existing navigation tests and the design guide; legacy inbox assertions were adapted but the full inbox acceptance suite was not rerun for this navigation-only change.

## Readable PDF reports — 11 October 2026

Replaced everyday report downloads with PDFs in the unified History & reports library, inbox review and payment review. Users can search saved records, read a review and download its PDF with progress and retry feedback. Original evidence exports and offline verification remain available inside a closed Advanced verification section; wallet-signing interchange remains unchanged.

Added authenticated, tenant-scoped PDF routes for inbox and invoice cases. Reports separate workflow decisions, recorded authority, execution and verified settlement; preserve historical method/version provenance; label stale business checks; and omit raw wallet identifiers and link destinations from the reading copy. PDF generation performs no network calls or financial actions.

Validation: **191 unit/API tests passed**, including 10 new PDF tests; TypeScript, ESLint and the production build passed. **Six focused browser scenarios passed** in Chrome, Firefox and WebKit at 1440px and 390px using a separate copied database with workers and seeding disabled. They cover both real PDF routes, individual review downloads, search/filter, failed-download retry and the collapsed verifier. Rendered all 16 pages across invoice, quarantined-email and long mixed-alphabet samples with PyMuPDF and inspected their layout. An initial mixed-font overlap was found visually, fixed with explicit line layout and covered by a regression assertion; the focused tests and browser scenarios were rerun after correction. Existing production chunk-size warnings remain. No payment/contract test was rerun and no new settlement is claimed.

Original environment files, saved chain/database/receipts and unrelated Fuji changes were preserved. Test downloads and raw results stay under ignored `var/pdf-qa/` and `var/pdf-report-qa/`. See [PDF_REPORTS.md](PDF_REPORTS.md).

## Inbox consolidation — 11 October 2026

Removed the duplicate Needs review landing page and navigation item. Inbox now owns all four filters, with accessible selected states and shareable URLs. Legacy `/review` bookmarks open `/?filter=review`, preserving other query parameters and composition requests. Mobile navigation now shows Inbox, Payments, Activity, Audit and More.

Validation: TypeScript and ESLint passed. Six focused browser runs passed in Chrome, Firefox and WebKit at 1440px and 390px: filter results, reloads, back/forward, navigation reset, old links, composition parameters and overflow. API responses were intercepted with temporary sample records; these were UI checks, not new backend/payment acceptance runs. No application writes or uncaught browser errors occurred. Local screenshots and results are retained in ignored `var/inbox-merge-qa/`. Existing environments, Fuji work and saved demonstration data were not modified.

## Visual refinement — 11 October 2026

Unified the main workspace and independent approver around the new sage/cream/forest references. Rebuilt the garden campus, mobile navigation, responsive payment cards and readable evidence outcomes. Validation: TypeScript, ESLint, 181 unit tests and production build passed. Across Chrome, Firefox and WebKit, 72 navigation/layout checks plus 18 saved-record checks passed at desktop/tablet/mobile sizes. Earlier failures and exact reruns are retained in [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) and [design-acceptance.json](qa/design-acceptance.json). Default campus draw calls fell from 287 to 195. Fixed tablet overflow, mobile account naming, campus framing and import links. No payment fixtures were submitted; original environment/deployment hashes match and saved demo receipts remain available.

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
