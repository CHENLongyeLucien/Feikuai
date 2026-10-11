# Feikuai

**AI reads. Rules decide. People sign. The blockchain enforces.**

Feikuai is a proof of concept that protects supplier payments from phishing,
invoice tampering and AI prompt injection. It is built for finance teams that
use AI to process invoices and pay suppliers in stablecoins.

## 1. How it works

Feikuai separates document analysis from payment authority:

1. A supplier invoice, email or message is received and stored with a
   SHA-256 fingerprint.
2. An Intake Agent extracts the invoice facts and suspicious instructions.
   It can read the source, but it cannot pay or modify records.
3. Security and finance checks compare the request with trusted supplier and
   payment records.
4. Suspicious or inconsistent requests are paused, sent to review or
   quarantined. They cannot be approved by simply ignoring the warning.
5. A legitimate request is shown to a human approver with its exact recipient,
   amount, token and invoice identity.
6. The approver signs those exact terms with a wallet using EIP-712.
7. The `PaymentGuard` smart contract on Avalanche Fuji enforces the recipient,
   amount, token, expiry and one-payment-per-invoice rules.
8. Feikuai displays **Paid** only after the blockchain receipt and payment
   event have been verified.

An AI response, transaction hash, animation or database status is never
treated as proof that money moved.

## 2. The project

### Threat addressed

An attacker can send an invoice that looks legitimate but changes the payout
wallet, claims that an executive already approved the payment, or contains
instructions designed to manipulate an AI agent. Feikuai detects these
signals before payment and keeps payment authority with a human and a
restricted smart contract.

### Main components

| Component | Purpose |
| --- | --- |
| `apps/web` | React workspace for the inbox, reviews, payments, dashboard and reports |
| `apps/api` | Fastify API, analysis pipeline, deterministic checks, jobs and reconciliation |
| `apps/approver` | Separate wallet verification and signing application |
| `contracts` | `PaymentGuard` and the DEMO test token |
| `packages` | Shared types, chain ABI and evidence verification |
| `fixtures` | Synthetic invoices, emails and attack scenarios |

### Quick start

Requirements: Node.js 24.14, pnpm 10 and Foundry.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm demo:start
```

Open [http://localhost:5183](http://localhost:5183) and start the local
demo. This mode uses synthetic data and a local chain; it does not require
keys or funds.

For development:

```bash
pnpm dev
```

- Workspace: `http://localhost:5173`
- Approval app: `http://localhost:5174`

Useful checks:

```bash
pnpm test
pnpm test:contracts
pnpm test:e2e
pnpm typecheck
pnpm lint
pnpm build
```

### Current results

Measured on 4,645 held-out items through the deterministic pipeline:

- **96.9%** alert precision
- **1.5%** false-positive rate
- **74.0%** quarantine recall
- **97.5%** of attacks were not automatically cleared
- **0.63 seconds** median detection time with the real worker
- **0** payment authorities created by an attack

The workflow validation suite scores **100/100**, and the manual test pack
scores **27/27**. Two complete Fuji test payments were also verified
on-chain.

### Limitations

This is a security-focused PoC, not a production payment system. Current
limitations include:

- deterministic agents were used for the measured results; live LLM quality
  has not yet been measured;
- links and attachments are not sandboxed, and sender authentication is not
  implemented;
- voice-clone detection, mailbox connectors and outbound webhooks are not
  included;
- a human can still approve a request that passes every rule;
- the Fuji deployment uses a valueless DEMO token and synthetic data.

More details are available in the [defense sheet](docs/DEFENSE_SHEET.md), the
[pitch deck and demo script](docs/PITCH_DECK.md), and the
[runbook](docs/RUNBOOK.md).
