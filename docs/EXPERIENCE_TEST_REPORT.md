# Inbox experience — actual results

Observed 11 October 2026, Europe/Paris (machine-readable timestamps use UTC). Synthetic Northstar data, local Anvil chain 31337, deterministic rules and fixture agents. No mainnet/Fuji transaction or live provider call was made for this acceptance run.

| Check | Actual result | Evidence |
| --- | --- | --- |
| TypeScript | Pass, including final event-stream/output-path changes | [Final log](results/experience/typecheck-recheck.log) |
| ESLint | Pass | [Final log](results/experience/lint-recheck.log) |
| Unit suite | 181 passed across 14 files | [Log](results/experience/test.log) |
| Contracts | 45 passed, including 15 AutomationGuard tests and existing invariants | [Log](results/experience/test-contracts.log) |
| Real-chain integration | 5 passed on isolated test contracts, temporary database | [Log](results/experience/test-integration.log), [receipts](results/experience/backend-chain-results.json) |
| Production builds |Web, independent approver, API and shared packages pass | [Final build](results/experience/build-recheck.log) |
| Inbox/browser | 7 passed: desktop/mobile navigation, actual automatic payment, phishing quarantine, human review, upload retry, connections, real WebGL campus | [Browser run](results/experience/test-e2e-recheck.log) |
| Independent approval browser | 1 passed in 10.5s: popup verification, local-wallet signature return, execution and 48,000 DEMO recipient increase | [Targeted rerun](results/experience/bridge-recheck.log) |
| Event-stream regression |29 existing backend tests passed after final SSE change; browser connection established within 5s | [Log](results/experience/event-stream-regression.log) |

The first aggregate `pnpm test:acceptance` passed seven gates and failed the browser connection assertion. Immediate SSE body output fixed proxy buffering. The browser rerun then passed all seven inbox tests and exposed an ambiguous approval-test selector that matched collapsed evidence panels. Scoping that assertion to visible source content produced the passing approval rerun. These results are consolidated in [final.json](results/experience/final.json); the earlier failed [aggregate](results/experience/acceptance.json) and browser logs are retained. They are not represented as an uninterrupted eight-test pass.

The final API build reports a large approver JavaScript chunk warning; compilation succeeds. Target-device frame rate and live wallet extension display have not been measured in this update. Browser tests use Chrome and the explicit public Anvil demonstration wallet, with software WebGL enabled. Legacy SIGKILL recovery was not rerun; its original results remain historical. New automatic outbox recovery is covered by 21 focused unit tests with mocked RPC observations, distinct from the real-chain evidence above.

## Verified payment observations

- [Automatic policy payment](qa/automatic-payment-result.json): successful local receipt, expected AutomationPaymentExecuted event, recipient increase 48,000,000,000 atomic units (48,000 DEMO). No human signature was requested; exact standing authority had already been registered by the policy owner.
- [Human approval payment](qa/guided-payment-result.json): verified independent packet, signature returned across pinned origins, operator-requested execution, successful PaymentExecuted event and the same exact recipient increase. No browser errors were recorded.

Raw signed transactions, authorization material, databases and source artifacts remain in ignored private runtime directories. Public result summaries contain synthetic identifiers and observed transaction references only.

## Measured detection limitations

The independently authored [24-case corpus](../tests/fixtures/inbox-security-corpus.json) includes 12 benign and 12 malicious text scenarios. The [benchmark](results/inbox-security-benchmark.json) records 8 true positives, 3 false positives, 9 true negatives and 4 false negatives: 66.67% recall, 72.73% precision and 25% false-positive rate **on this corpus only**. Misses include French credential phishing, a homoglyph, urgency-only voice content and indirect remittance language. Benign holds include an ordinary URL and quoted/negated attack wording.

Across 24,000 warmed local classification/security evaluations, median rule time was 0.057291 ms and p95 was 0.125375 ms. This excludes HTTP, parsing, storage, agent inference, human response and payment latency. A missed security rule is not proof the complete workflow would authorize payment: trusted-record, authority and contract controls are separate. These measurements do not establish production readiness.

## Visual review and use

Inspected the [inbox](qa/redesign-inbox.png), [mobile view](qa/redesign-mobile.png), [mobile review](qa/redesign-mobile-review.png), [invoice review](qa/redesign-invoice-detail.png), [security findings](qa/redesign-security-review.png) and [campus](qa/redesign-operations-1440.png). The campus also passed 1280 px panel-overlap and draw-call checks; mobile content passed 390 px overflow checks.

Run `pnpm demo:start`, open http://localhost:5183 and choose **Explore the demo**. In another terminal, `pnpm test:acceptance` uses this isolated deployment. Payments consume finite once-only fixtures; do not erase saved state to make a used obligation look unpaid. See the [guide](EXPERIENCE_DEMO.md) for external configuration requirements and [track playbook](TRACK_ALIGNMENT.md) for responsibility and audit boundaries.
