# Recorded 100-input workflow validation

The complete update also passed **471 unit/API tests** (including this 100-scenario corpus), **27 dashboard browser checks**, TypeScript, repository ESLint and the production build. See [verification summary](verification-summary.json), [unit/API output](unit-api.log), [browser output](dashboard-browser.log), and the [workflow/dashboard guide](../WORKFLOW_REPAIR.md). Dashboard screenshots show intercepted synthetic QA data: [desktop](dashboard-desktop-synthetic.png), [mobile](dashboard-mobile-synthetic.png).

The final run accepted **100/100 inputs** and matched **100/100 independently authored expectations**: 29 workflow clearances, 33 human-review holds, and 38 security quarantines. There were no missing inputs, unfinished jobs, missing result notifications, network attempts, or payment attempts. A separate Vitest run passed **101/101 assertions** (100 scenarios and one global safety assertion) in 4.98 seconds.

The [source index](../../fixtures/workflow-validation/README.md) contains 25 invoice PDFs, 25 email files, 25 voice transcripts, and 25 text requests. Every source is synthetic and distinct. Trusted test obligations are 10 DEMO each. Expectations were written before the first run and were not relaxed to fit implementation behavior.

## Actual runs

| Run | Matched expectations | Observed discrepancies | Record |
| --- | --- | --- | --- |
| Initial | 81/100 | 17 routine administrative requests unnecessarily held; two French credential requests lacked the required quarantine finding | [Complete initial report](baseline-results.md), [machine-readable report](baseline-results.json) |
| After first corrections | 96/100 | Four routine call, review, check-in, and public-feedback requests still held | [Recorded console summary](intermediate-summary.json) |
| Final | 100/100 | None | [Complete final report](results.md), [machine-readable report](results.json) |

The intermediate record is a transcription of the runner's observed console summary and four exact discrepancies. Its full per-case report was overwritten by the final run; it is not reconstructed or presented as a retained full report. Initial and final reports are direct copies of the runner output. These records contain only synthetic fixture information, counts, authored expectations and observed results.

All runs accepted all 100 submissions and had no global safety invariant failures. The final run executed 40 invoice-specialist analyses and drained the durable inbox and payment-analysis queues in 30 worker ticks. It did not infer that a review hold or quarantine was a failed test: those are the required outcomes for incomplete or unsafe inputs.

## Repeat the validation

From the project root:

```sh
pnpm test:workflow
# Equivalent: npm run test:workflow

# Run the 101 assertions in the normal test framework:
pnpm exec vitest run tests/api/workflow-validation.test.ts

# Regenerate the authored source files and manifest:
pnpm fixtures:workflow
```

The runner authenticates a synthetic member through the real challenge/verification endpoints, submits the PDFs and email files through multipart intake, and submits voice transcripts/text through the same authenticated intake API used by the application. It runs real extraction, classification, security rules, invoice agents, trusted-record checks, durable workers, final audit and notification persistence. It reads every result and the complete inbox list through API routes.

Its SQLite database, trusted registry, deployment manifest and artifacts live in a fresh temporary directory that is deleted after the run. Seeding the existing workspace is deliberately not invoked. Local `.env`, Fuji configuration, existing databases, receipts and chain state are not changed. A public development mnemonic signs only the isolated authentication challenge; no wallet or blockchain operation is performed.

The fixture agents run deterministically. Chain scanning is explicitly replaced with an offline stub, all network fetches are blocked and counted, and transaction submission/reconciliation are guarded against accidental execution. The runner asserts zero payment authorizations, proposals, execution requests, settlements, automated payments, and transaction-outbox records. It also asserts that approved inbox results have only workflow scope, all five processing stages finish, and quarantined sources do not proceed to financial processing.

Each fresh run writes `var/workflow-validation/results.json` and `results.md`, which Git ignores. Checked-in reports here are snapshots of the completed validation, not live application data.

## Document checks and limits

All 25 PDFs were rendered and visually reviewed. They are single-page text PDFs with readable content and no clipped text. Regeneration produced identical document and manifest hashes. Attack examples inside them are inert text; there are no executable PDF attachments.

This is a regression corpus, not a measured production fraud-detection rate. It does not test live model quality, provider availability, audio transcription, speaker identity, email sender authentication, an isolated malware browser, wallet signatures authorizing payment, chain settlement, or payment-policy automation. Voice inputs are transcripts, not audio files. Rate limits remain active; reserved documentation IPs in groups of ten allow the 100-case run without changing application limits.

The trusted test obligations exist only in the temporary registry. Manually uploading an invoice into a different workspace without its corresponding trusted obligation should produce a review hold. A workflow clearance is not a settled payment, and no DEMO balance is consumed by this validation.
