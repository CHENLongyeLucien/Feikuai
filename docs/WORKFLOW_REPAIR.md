# Intake workflow repair and finance dashboard

11 October 2026. See the [100-input results](workflow-validation/README.md) and [source files](../fixtures/workflow-validation/README.md).

## What was wrong

| Cause | Correction |
| --- | --- |
| Email uploads were treated as raw UTF-8, leaving encoded bodies unreadable. | Bounded MIME parsing decodes base64, quoted-printable, multipart alternatives, HTML text and supported PDF attachments. Links remain unverified and are never opened. Unreadable parts produce an explicit review hold. |
| PDF extraction flattened line boundaries; invoice matching recognized a narrow set of English labels. | Preserve PDF line endings; share source-span extraction for English/French invoice labels; handle exact, unambiguous comma decimals. Missing, conflicting or mismatched facts still prevent clearance. |
| Accompanying text could disappear when a file was supplied. | Keep both the message and extracted file content, including their security findings. Normalize MIME parameters and recognize generic file uploads conservatively. |
| French credential requests could miss the security gate, while ordinary administrative requests were held. | Expand supported English/French security and administrative rules. Financial, account-changing, ambiguous and unsupported requests continue to require review. |
| Failed invoice analysis could leave a case and inbox waiting indefinitely. | Terminal analysis failures become an explicit needs-information outcome. Detect missing/completed analysis jobs, bound waiting attempts, finish unperformed stages honestly and persist a result notification. |
| Worker exceptions and expired leases could interrupt progress or duplicate analysis. | Contain scheduler errors, recover durable leases, renew active analysis leases, process bounded inbox batches and avoid repeated unchanged version updates. |

These changes do not turn incoming text into payment authority. The path remains: intake and classification → security → trusted client/finance checks → policy → independent final audit → recorded result. Security holds stop financial processing. Eligible invoices still need the existing human signature or a separately registered exact payment policy. An approval is never reported as settlement.

## Using the dashboard

Open the workspace and choose **Dashboard** in the top bar. It opens within the current workspace, preserving the selected source and process map. Close the panel to continue your review.

- **Registered, verified paid, and not yet verified** show exact DEMO amounts for the configured token and workspace. The last figure is an obligation total, not a wallet balance.
- **Activity over time** switches between payments, incoming items and first recorded workflow clearances. Choose 7, 30 or 90 UTC days; open the daily table for exact values.
- **Sources, suppliers and recent activity** cover workspace history. Activity links return directly to the corresponding source or payment case.
- Review/security counts, empty states, unavailable financial coverage and loading failures are explicit. The dashboard does not display private keys or raw wallet references.

The authenticated `/api/v1/dashboard` endpoint aggregates the whole tenant history instead of the latest-100 inbox list. Monetary sums use integer atomic units; receipts are matched to their registered obligations and deduplicated per invoice across human and automatic routes. Failed, unknown, pending or unmatched records are excluded from paid totals. Charts use the recorded receipt-observation date, not a claimed block timestamp. First workflow clearance comes from its durable notification, not the source's later update time. No dashboard read signs, submits, scans the chain, runs an agent or changes the database.

## Testing and remaining boundaries

The authored corpus contains 25 text-based PDF invoices, 25 EML messages, 25 voice transcripts and 25 text requests. Each source enters the actual authenticated intake API and both durable workers in a temporary environment. All 100 matched their expected outcomes: **29 cleared, 33 review holds, 38 quarantines**. A hold is a passing test when the source lacks evidence or contains a security issue. All sources were retained with terminal stages and durable notifications. No DEMO was spent.

The initial run matched 81/100 expectations, the intermediate run 96/100, and the final run 100/100. Expectations were retained throughout. Full initial/final reports and the retained intermediate summary are linked in the result index.

Run `pnpm test:workflow` to repeat the isolated corpus. `pnpm test` includes the same 100 scenarios, their global invariant check, intake recovery, PDF extraction and dashboard regressions. Browser checks are under `tests/e2e/dashboard.config.ts`; these intercept read-only synthetic API responses and test UI behavior separately from the real API tests.

This is measured regression coverage, not production fraud accuracy. Live model behavior, real audio transcription, sender/speaker authentication, OCR, mailbox synchronization and isolated URL/malware scanning are not demonstrated by this run. Voice samples are transcripts. Scanned/encrypted PDFs need a supported text-based replacement. Unknown invoice references need a corresponding independently trusted payable; the 100-test registry exists only inside the isolated runner. No credentials or testnet funding are needed for these tests or for the dashboard. Live provider/transcription testing requires privately configured provider credentials and model settings. No new wallet transfer or Fuji deployment was performed.

## Reset-brief repairs (11 October 2026, second pass)

These repairs follow the eight-stage workflow in the Feikuai reset brief. [v2 results for 100 new inputs](workflow-validation-v2/README.md).

| Stage | Problem | Correction |
| --- | --- | --- |
| 4 Finance | A finance-agent `HOLD`/`NEEDS_INFORMATION` recommendation, or an open discrepancy, did not block the case. A live model's hold could disappear before the payment decision (brief P0.2). | New hard checks `FINANCE_RECOMMENDATION` and `FINANCE_DISCREPANCIES`. Only suspicious prose stays an acknowledgeable attention item. The hold reason now names the failed checks. |
| 4 Finance | Submitting the same unpaid invoice twice opened a second payment case, and both could be workflow-cleared. | The second submission is held as a duplicate that names the original item. No second case is created. Already-paid invoices keep their receipt view. |
| 6 Final check | Execution relied on a stored `READY_FOR_REVIEW` flag and only rechecked the document version. | `Service.preExecutionAudit` runs when execution is requested and again just before the relayer signs. It recomputes business checks from current records and requires current payable, supplier and document versions. It confirms the signed terms equal the trusted payable and deployment, finds no other unresolved execution, and checks that the source inbox item is not quarantined or rejected. Failure is permanent (`PRE_EXECUTION_AUDIT_FAILED`). |
| 3 Security | Spoken credential requests ("read me the code", "tell me your recovery phrase", access codes), remote-access tooling and "ignore your rules" injections were missed. A French reschedule was falsely held. | Narrow rule additions with false-positive regression tests (`tests/api/detection-rules.test.ts`). |

Platform history can be cleared with `pnpm history:reset <db> <artifact-root> --yes`. It backs up the database and artifacts to `var/backups/history-reset/`. It keeps verified settlements, because they mirror irreversible on-chain payments.
