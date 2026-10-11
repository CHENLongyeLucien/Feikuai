# Integration API: Feikuai behind a bank's or fintech's own tools

Feikuai has one engine (checks, human authorization, payment, evidence) with two ways in:

| | Workspace | Integration API |
| --- | --- | --- |
| For | Small companies without accounts-payable software | Companies with an ERP or accounting system |
| Who enters data | A person uploads invoices | The customer's system, automatically |
| Who follows status | A person, in the Workspace | The customer's system, by polling the API |
| Setup | Sign in | A developer adds a token and five calls |
| System of record | Feikuai | The customer's ERP |

Both use the same checks, the same rules and the same human authorization. French version: [API_README.fr.md](API_README.fr.md). Machine-readable contract: [integration/openapi.yaml](integration/openapi.yaml).

## The five calls

Base URL `/api/v1/integrations`. Send `Authorization: Bearer <token>` with every call, and an `Idempotency-Key` header with every POST.

| Step | Call | Result |
| --- | --- | --- |
| 1 | `POST /payables` | The ERP registers the obligation: supplier, wallet, exact amount, its own `sourceSystem` + `externalId` |
| 2 | `POST /cases` (multipart `file`) | The supplier's invoice is stored and checked in the background |
| 3 | `POST /cases/{id}/analysis` | Optional rerun; returns 202 immediately |
| 4 | `GET /cases/{id}` | Status, checks, plain-language hold reason, proposal and `approval.approvalUrl` |
| 5 | Human signature | A person opens `approvalUrl`, clicks **Approve & pay** and signs with the approver wallet |
| 6 | `GET /executions/{id}` | Followed until `CONFIRMED`, which is only reported after the chain receipt is verified |

Also available: `GET /payables/{sourceSystem}/{externalId}`, which looks up a payable by the ERP's own identifier.

Case `status` values: `PROCESSING`, `NEEDS_INFORMATION`, `NEEDS_REVIEW`, `READY_FOR_APPROVAL`, `AUTHORIZED`, `PAYMENT_PENDING`, `PAID`, `OUTCOME_UNKNOWN`. Every response also carries a `nextAction` sentence.

## Guarantees

- **A token belongs to one tenant.** The tenant comes from the token and is never read from the request. Another tenant's cases and payables return 404.
- **Tokens are stored as SHA-256 hashes** and can be revoked. Each token acts as its own operator identity, so its actions are attributable in the audit trail.
- **The API cannot authorize a payment.** A token has no reviewer role. Proposal, signature-import and execution routes accept only an authenticated Workspace session with CSRF protection. A bearer token there returns 401.
- **Idempotency.** The same key with the same body returns the first response. The same key with a different body returns `409 IDEMPOTENCY_CONFLICT`.
- **Immutable obligations.** Re-importing a payable returns `409 PAYABLE_EXISTS`. Changing a supplier's wallet requires a new supplier version, and a conflicting wallet for an existing version returns `409 SUPPLIER_VERSION_CONFLICT`.
- **Stable identities.** The same ERP record always maps to the same on-chain invoice key. The contract refuses to pay one invoice twice.
- **The contract has the last word.** Payments only execute for suppliers registered in the deployed PaymentGuard. A supplier unknown to the contract is held (`VAULT_MAPPING`) with an explanation.
- **Errors** always have the form `{"error":{"code":"...","message":"..."}}`.

## Try it

```sh
# 1. Issue a token for the workspace (printed once; only its hash is stored)
pnpm integration:token issue --tenant northstar-demo --name acme-erp --db var/fuji/secure-finance.sqlite

# 2. Play the ERP: clean invoice, then an invoice whose payout wallet was altered
FEIKUAI_TOKEN=sfk_... pnpm integration:demo
FEIKUAI_TOKEN=sfk_... pnpm integration:demo -- --attack
# Add --wait to follow the execution after a person approves at the printed link.
```

Recorded run on 11 October 2026, against an API on a copy of the Fuji database:

- **Clean invoice:** `READY_FOR_APPROVAL` 1.5 s after submission, with every check passed and the approval link returned.
- **Altered wallet:** `NEEDS_REVIEW` 1.5 s after submission. Failed checks: `RECIPIENT`, `FINANCE_RECOMMENDATION`, `FINANCE_DISCREPANCIES`. Reason shown: *"Payment paused: the requested payout wallet differs from the verified wallet on file for Atlas Cloud Services… No payment has been sent."*

The 1.5 s figure is the polling interval of the demo client; the checks themselves completed within it.

```http
POST /api/v1/integrations/payables
Authorization: Bearer sfk_...
Content-Type: application/json
Idempotency-Key: acme-payable-1

{"externalId":"payable-1","sourceSystem":"acme-erp","invoiceReference":"INV-1",
 "supplier":{"externalId":"sup-1","name":"Atlas Cloud Services","recipient":"0x5d99ddf74ec01f61e37ecae561e60d72bfb81ce4","version":"1"},
 "amount":{"atomic":"10000000","token":"DEMO"}}
```

```sh
curl -H "Authorization: Bearer sfk_..." -H "Idempotency-Key: acme-case-1" \
  -F sourceSystem=acme-erp -F payableExternalId=payable-1 -F file=@invoice.pdf \
  http://localhost:3001/api/v1/integrations/cases
```

## What is not included yet

- **Pushed status updates.** The ERP polls; outbound webhooks to the ERP are not implemented.
- **Self-service token management.** There is no UI; tokens are managed with the CLI.
- **Assets.** DEMO is the only asset.
- **Supplier registration on-chain.** Registering a new supplier in the payment contract requires a new deployment.

Tests: `tests/api/integration-api.test.ts` covers authentication, revocation, tenant isolation, idempotency, immutability, the full checks flow, recipient redirection, unknown suppliers, and closed authority routes.
