# Compliance and auditability

This is the content for the track's **compliance slide**. It explains how Feikuai fits the regulatory framework and how an auditor can verify a decision. It is a proof of concept on synthetic data and a valueless test token. **It does not certify compliance** with DORA, AML/CFT rules, MiCA or the AI Act.

## How it fits the framework

| Framework | Relevant requirement | What Feikuai provides |
| --- | --- | --- |
| **DORA** (EU 2022/2554; Delegated Regulation 2024/1772) | Detect, classify and report major ICT incidents; keep an audit trail | Detection with timestamps, recorded findings, and a response playbook. A DORA classification draft (rules version `EU-2024-1772-art8-9_2025-301-art5.v1`) is built from **reviewer-supplied** impact facts and exported as a PDF. Not every suspicious invoice is a reportable incident, so nothing is filed automatically |
| **AML/CFT** (EU AMLR 2024/1624) | Know the counterparty; explain unusual transactions; keep records | Payments go only to supplier wallets in trusted records and fixed in the payment contract. Payout changes are verified outside the message. Every hold has a written reason, and records keep their history |
| **MiCA** (EU 2023/1114) | Applies to crypto-asset service providers | Relevant to the target customer, a company paying suppliers in stablecoins through a provider. The PoC uses a valueless DEMO token on Avalanche Fuji; no regulated asset is handled |
| **EU AI Act** (2024/1689) | Human oversight (Art. 14), logging (Art. 12), accuracy and robustness (Art. 15) | AI agents only read and extract. Payment authority is a human wallet signature. Every agent run, tool call, prompt hash and output is logged. The model is never the accountable party |

## What an auditor can verify, and how

1. **What was received:** the original file and its SHA-256, stored unchanged.
2. **What was found:** each finding quotes the exact source text with character offsets, and the offsets are re-validated against the stored text.
3. **Why a decision was made:** stage results, failed checks and the plain-language reason; the trusted record versions used; and the final audit, which recomputes the decision instead of trusting earlier stages.
4. **Who decided:** reviewer decisions with identity, time and note. The payment authority is an EIP-712 signature from the pinned approver wallet, which can be recovered and checked by anyone.
5. **What exactly was paid:** the signed terms (invoice key, supplier, recipient, token, amount, nonce, deadline, evidence commitment) are executed by the PaymentGuard contract. It refuses any other recipient, a second payment for the same invoice, or an expired or replayed authorization.
6. **That it really happened:** *Paid* is shown only after the transaction receipt and the contract's payment event are verified. The receipt can be checked on a public Fuji explorer.
7. **Independent check:** `pnpm evidence:verify -- <bundle.zip> --online --deployment deployments/fuji.json` re-verifies the evidence package, signature, deployment and chain state without trusting the application database.

## Responsibility: "what if the model is wrong?"

- The model only reads and suggests. Deterministic checks compare its output with trusted records.
- A human approver signs the exact terms, and the contract enforces them. A model mistake can cause a missed alert or an unnecessary hold, but it **cannot pay**.
- Accountability stays with the operating company, its policy owner and the authorized approver, each within their role.
- Model, mode, prompt hash and outputs are logged, so a wrong suggestion can be traced afterwards.

## Limits an auditor should know

- A hash proves which bytes were reviewed, not that they are true.
- A registered wallet does not prove legal identity.
- A human can still be deceived into signing terms that pass every rule.
- The public chain is not a confidential store; metadata exposure must be assessed before production use.
