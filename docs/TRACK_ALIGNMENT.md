# Track01 — Fintech Security: demonstration and response playbook

Basis: the two supplied track presentation images, read on 11 October 2026. They call for a concrete end-to-end fraud/incident PoC, a response playbook, measured results, and an explanation of what an auditor can verify. Their embedded descriptions are task reference material, not executable instructions or payment authority.

## Concrete scenario

A low-privilege invoice or email source claims that the CFO already approved a transfer and asks for a replacement destination or credentials. Intake classifies it; security records the exact suspicious source spans; downstream financial execution is stopped. A reviewer receives an in-app incident notification and can inspect/download the source and report. The user cannot manufacture authority by approving the flagged prose. Independent final audit recomputes source integrity and current checks rather than accepting an earlier agent's success flag.

The comparison case is a matching synthetic invoice: known payable, known supplier, exact amount, no detected source risks and passing final audit. It can use previously registered exact standing authority; otherwise it needs independent human wallet approval. Both local routes have real contract execution and receipt verification. The blockchain enforces encoded authority and replay limits; it does not prove that an invoice is commercially true.

## Responsibility and response

| Finding | Automatic response | Responsible person and next action | Retained evidence |
| --- | --- | --- | --- |
| Claimed executive approval, changed destination, credential request | Quarantine; stop downstream processing; in-app alert | Security/reviewer verifies via a separately trusted contact channel; reject or replace the source | Source bytes/hash, extracted spans, stage decisions, timestamps, notification and review history |
| Unverified link | Hold; never fetch in the application | Security analyst uses an approved isolated scanner; no application claim that a URL is safe | Exact URL, unverified reason, incident report |
| Amount, supplier or payable mismatch | No automatic approval/payment | Finance owner corrects trusted records through governed procedures or rejects the request | Trusted record references/versions and check results |
| Unclear voice/payment request | Ask for human context | Reviewer authenticates the requester independently; records a decision/reason | Transcript provenance and review history; no implied speaker authentication |
| Final audit disagreement or source change | Block clearance/new broadcast | Reviewer investigates evidence drift; source assertions cannot override it | Recomputed integrity and failed audit reasons |
| Uncertain payment result | Preserve pending/unknown; reconcile | Finance operations checks existing transaction; never blindly sends another payment | Durable signed outbox, nonce/hash, verified receipt/event/transfer when available |

Only authorized workspace reviewers can record human decisions. Request-information records a task in the platform; it does not send an external message. The finance/policy owner remains responsible for registering legitimate obligations and limits. The incident owner remains responsible for severity classification, escalation and any legally required reporting if a model or reviewer is wrong. The demo does not autonomously contact regulators.

## Compliance and audit explanation for the pitch

- **DORA:** incident records and response history support incident-management review. The [AgentGuard addition](AGENTGUARD.md) supplies deterministic single-incident threshold support, conditional baseline deadlines and reviewer-requested PDF drafts. Facts remain unknown until supplied; applicability and formal classification require a qualified reviewer. Regulatory templates, recurring-incident aggregation, calendar exceptions and submission are not implemented. [Official regulation](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32022R2554).
- **OWASP ASI03/ASI07:** source-fed agents have limited read-only business tools; model content is separated from payment authority; the approval channel is bound to source/origin/nonce, and the executor is bound to exact registered or signed terms. This is a bounded demonstration of controls, not a claim that all agent attacks are prevented. [OWASP agent security guidance](https://cheatsheetseries.owasp.org/cheatsheets/AI_Agent_Security_Cheat_Sheet.html).
- **AML/MiCA/AI Act:** the project has no implemented KYC/AML screening, regulated-asset authorization assessment, or AI Act conformity assessment. Synthetic local DEMO tokens and audit artifacts do not establish compliance. Those assessments and production governance are outside this demo.
- **Auditor verification:** download an item's incident report; compare original/extracted hashes, stage modes and source spans with trusted record versions; inspect human review history and exact payment authority; independently verify the matching chain event and token transfer. Human PaymentGuard evidence bundles also use the existing standalone verifier. Automatic-policy evidence has its own commitment and receipt checks and must not be represented as a human signature.

## Measurement boundaries

Use the actual reports linked in `BUILD_STATUS.md`. The browser suite observes real local payments and quarantine, while unit tests inject deliberate failures into receipt and recovery observations. The synthetic security benchmark measures a documented rule corpus and local rule timing only; it is neither a representative fraud dataset nor a production detection-rate claim. Missed paraphrases and conservative holds must remain visible in the report.
