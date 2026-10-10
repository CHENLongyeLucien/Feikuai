# Inbox and isolated automation backend results

Implemented additive SQLite persistence for multichannel intake, five specialist stages, independent final audit, human review history, source provenance, and in-app notifications. HTTP links remain unverified and quarantined; the service never opens them. Manual voice transcripts work without provider credentials. Audio transcription requires an explicitly configured OpenAI key and `INBOX_TRANSCRIPTION_MODEL`; it was not exercised with a live provider in these tests.

Invoice clearance uses the existing trusted payable and actual case analysis. It does not create payment authority. The optional automatic executor is restricted to an explicitly configured loopback local chain, a separate AutomationGuard, exact owner-registered obligations, and a dedicated executor. Fuji automation is disabled. Existing PaymentGuard settlement records are not modified by this executor.

Signed transaction bytes are durable before broadcasting. Restart and uncertain-response recovery use the saved hash and identical bytes. Confirmed status requires matching canonical receipt, executor, chain, nonce, calldata, complete AutomationPaymentExecuted event, ERC20 Transfer, and consumed evidence commitment. Review changes stop new broadcasts while receipt observation continues. Unsigned nonce reservations are released only when both current and pending executor nonces prove they remain unused.

Standing-policy assignments persist after contract and obligation verification. Missing or malformed configured manifests fail closed for new human payment authority. Removing configuration does not delete persisted assignments. The automatic path rejects consumed legacy invoices, unresolved legacy executions, and exported human packets that remain executable.

## Actual validation

`node node_modules/vitest/vitest.mjs run tests/api/automation.test.ts tests/api/inbox.test.ts tests/api/backend.test.ts`

- **68 passed:** 21 automatic executor tests, 18 multichannel inbox tests, 29 existing backend tests.
- Automation tests use real local SQLite and offline signed transactions with deliberately mocked RPC observations. They test signed-before-send persistence, lost responses, restart with identical bytes, holds, independent receipt negatives, immutable policy/chain gates, unchanged evidence commitments, durable cross-vault exclusions, and nonce uncertainty. They do not claim live network execution.
- Full TypeScript check passed during implementation.
- ESLint passed for the changed backend modules and new test files.

Root integration testing separately exercises the isolated local chain and browser. Its actual receipts and final aggregate results belong in the main acceptance report; this file does not substitute mocked observations for those results.

## Remaining integration requirements

- Configure `AUTOMATION_MANIFEST_PATH` and `AUTOMATION_EXECUTOR_PRIVATE_KEY` only for the isolated local demo; its launcher provides an explicit public Anvil test account and test-token policy funding.
- A real audio transcription run needs an OpenAI API key and configured transcription model.
- No Gmail account, mailbox OAuth grant, caller identity verification, or isolated link-analysis browser is implied by pasted content, `.eml` uploads, transcripts, or successful deterministic rules.
