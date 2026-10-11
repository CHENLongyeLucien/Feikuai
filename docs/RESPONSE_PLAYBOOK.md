# Response playbook

Scenario: a supplier payment request has been manipulated. It might be a changed payout wallet, a false executive approval, instructions aimed at the AI agents, or a credential lure. The playbook says who is alerted, what is automatic, what stays human, and how each step is documented.

## Graduated response

The response is proportionate: the system never pays automatically, and it reacts more strongly as the evidence gets stronger.

| Level | Trigger | Automatic action | Human responsibility | Recorded |
| --- | --- | --- | --- | --- |
| **Cleared** | Routine message, or an invoice that exactly matches the trusted record | Routed without a payment case. A matching invoice becomes *Ready for approval*; nothing is paid | The approver reviews the exact terms and signs, or does not | Source hash, every stage decision, mode (rules, fixture or live agents) |
| **Needs review** | Money movement, contract, sensitive data, unverified link, unclear purpose, missing invoice facts, duplicate request | Payment paused; reviewer notified in the app; reason stated in plain language | The reviewer decides with a written note, asks for information, or rejects | Reason, failed checks, trusted record versions, the reviewer's decision and note |
| **Payment paused (finance)** | Payout wallet, amount, currency, supplier or invoice number differs from the trusted record; already paid | No proposal can be created; the trusted record is **not** changed by the document | The finance owner verifies through a supplier contact **already on file**, never one supplied by the message | Expected versus received values, record versions |
| **Quarantined (security)** | Claimed approval, destination change, AI-targeted instructions, credential request, phishing pattern, secrecy or urgency, executable content, disguised characters | Stopped before any financial step. Human approval cannot override quarantine. Security alert raised | The security reviewer investigates through a known channel, rejects, or asks for a corrected source. Links are never opened | Exact source quotes with offsets, findings, final-audit recomputation, alert |
| **Stopped at final check** | Records changed, terms differ from the signature, source quarantined, another execution unresolved | Execution refused (`PRE_EXECUTION_AUDIT_FAILED`) | Operations re-runs the checks and issues fresh terms if appropriate | Failed conditions, frozen versus current versions |
| **Outcome unknown** | The transaction cannot be confirmed | Never resent automatically; reconciliation queued | Operations reconciles the receipt or nonce before any retry | Every attempt, transaction hash and receipt observation |

## Who is alerted

- **Reviewer or security analyst:** in-app notification with the reason, a link to the item and a downloadable PDF report. There is no email or SMS connector, by design: the demo sends nothing outside the app.
- **Finance owner:** sees *Payment paused* in the workspace or through the integration API (`status: NEEDS_REVIEW`, `nextAction`).
- **Approver:** sees only *Ready for approval* items, with exact terms in the separate approval application.
- **Incident owner:** after a confirmed incident, prepares a DORA classification draft with reviewer-supplied impact facts and downloads it as a PDF. Nothing is filed automatically.

## Automated versus human

| Automated | Always human |
| --- | --- |
| Intake, extraction, classification | Signing every payment (EIP-712, approver wallet) |
| Security rules and quarantine | Releasing a hold or rejecting a request |
| Comparison with trusted records | Changing a supplier's payout wallet (new record version, outside the message) |
| Duplicate and already-paid blocking | Cancelling a signed authorization on-chain |
| Final pre-execution audit | DORA impact facts and any regulatory report |
| Submitting exactly one transaction after a signature | Deciding what an ambiguous request means |
| Verifying the receipt before showing *Paid* | |

## After a signature

An application hold does **not** revoke a signature that already exists. If a risk appears after signing, the approver cancels the nonce on-chain from the approval application. The case shows the observed outcome, which is cancelled, expired or executed, and never assumes one.

## Documentation

Every item keeps:
- the original bytes and their SHA-256;
- each stage's result, mode and timestamps;
- the findings with exact quotes;
- the trusted record versions used;
- human decisions with their author and note;
- the frozen payment terms and evidence commitment;
- the signature, transaction and verified receipt.

Readable PDF reports exist for inbox items and cases. Evidence ZIP bundles can be verified independently with `pnpm evidence:verify -- <bundle> --online --deployment deployments/fuji.json`.
