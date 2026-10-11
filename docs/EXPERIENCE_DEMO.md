# Inbox experience and reproducible demonstration

The current product starts with **Inbox**, not a technical transaction dashboard. The user sees what arrived, what was checked, what needs attention, and what actually happened. Wallet addresses, hashes and implementation metadata belong in expandable evidence views. The optional **Operations** view retains the animated 3D finance campus.

## Start and resume

With the repository dependencies and Foundry installed, run `pnpm demo:start`, then open http://localhost:5183 and choose **Explore demo**. Independent payment review opens on http://localhost:5184. The demo API uses port 3183 and its local chain uses 18545. Stop the launcher with Ctrl+C; run the same command to resume.

The launcher saves its database, chain snapshot, manifests and receipts under ignored `var/experience-demo/`. Do not separate these files or delete them to replay a paid invoice. It refuses to overwrite an inconsistent saved deployment. Existing `.env`, `.env.fuji`, `var/anvil-state.json`, local database and root deployment manifests are preserved. Demo login and the browser demonstration wallet are restricted to explicitly enabled local-chain operation.

## Three-minute walkthrough

1. **Matching invoice:** choose the invoice example. The source moves through classification, security, client/finance checks, approval policy and independent final audit. A matching invoice among the five exact owner-registered obligations can pay automatically. Wait for **Payment confirmed**; a cleared workflow alone is not a payment. Payment history and downloaded incident evidence show the verified result.
2. **Suspicious email:** choose the phishing example. Claimed approval, a credential request and an unverified URL cause a security hold. The process stops, an in-app notification appears, and the item explains the evidence. No link is visited. There is no approve-payment action on quarantined content.
3. **Voice request:** choose the voice example or paste a transcript. A financial request without enough trusted context goes to human review. **Request information** records the reviewer and reason; it does not send an email or message. Reject or supply a new, verified source as appropriate. The final audit checks the human decision against current records.

For a human-authorized payment outside the standing policy, open a checked invoice's payment review. The separate approval window verifies the packet, presents the exact terms and requests a wallet signature. Its result returns to the original window through a pinned origin/source/nonce channel. The operator then explicitly submits execution. Download/import remains available as a fallback. Automatic-policy invoices do not expose the human authorization route.

The five automatic invoices are finite obligations, payable once. The launcher never resets their settlement to make the demo repeat. Browser acceptance uses unused obligations; after exhausting them, use existing confirmed examples for inspection or provision a separate, explicitly new demonstration environment. Do not fund or reset a real deployment for this purpose.

## Inputs and integrations

| Input | Working behavior | Current boundary |
| --- | --- | --- |
| Invoice text/TXT/PDF | Bounded private upload, extraction, trusted payable match, existing intake/finance agents and deterministic checks | PDF extraction is not a malware verdict; unfamiliar payables require review |
| Email text/EML | Import as untrusted source; classify, flag evidence, quarantine, notify | Sender identity is not authenticated; Gmail/Outlook OAuth is not implemented |
| Voice transcript | Process manual transcript through the same checks | A transcript does not establish speaker identity or detect a cloned voice |
| Audio file | Validate supported file signature; configured OpenAI transcription adapter | Without key/model, hold for review; live transcription has not been run |
| Internal system | Signed, replay-resistant inbound webhook | Intake-only; a connector cannot approve or pay |
| Links | Retain evidence and halt for independent verification | No isolated browser/scanner is configured; links are not fetched or declared safe |

The legacy `/connections` page remains available by direct URL for technical inspection; Connect is no longer in navigation. Model mode is shown in the stage evidence: the current local demo uses deterministic rules and fixture agents. Existing live intake/finance adapters require `OPENAI_API_KEY` and `OPENAI_MODEL`; audio additionally requires `INBOX_TRANSCRIPTION_MODEL`. Configure credentials privately in the appropriate environment, never through the UI or Git.

## Internal intake connector

Set a private `INBOX_WEBHOOK_SECRET` of at least 32 characters and `INBOX_WEBHOOK_TENANT_ID` to an existing workspace, then restart the relevant API. POST JSON to `/api/v1/inbox/webhook`:

```json
{
  "eventId": "d687b1f8-b26c-4b20-8d56-fb7bfc670936",
  "timestamp": "<current ISO8601 UTC timestamp>",
  "source": {
    "channel": "email",
    "title": "Client request",
    "sender": "client@example.invalid",
    "text": "Please schedule a support meeting next week."
  }
}
```

The sender signs RFC8785 canonical JSON bytes of the complete envelope with HMAC-SHA256 and sends `x-inbox-signature: v1=<lowercase hex digest>`. The server allows a five-minute delivery window, scopes the event to the configured tenant and deduplicates by eventId. Keep eventId/payload stable when retrying inside that window. Reusing the identifier for different content is rejected. See `webhookSignature` in `apps/api/src/integrations/webhook.ts` for the shared signing implementation. A successful202 response means intake only.

## Authority and blockchain

An agent's confidence is never authority. Human payments retain the existing PaymentGuard signature path. Local automatic payments use a separate AutomationGuard with immutable token/owner/executor, allowed suppliers, payment/budget caps and exact obligations registered by the owner. The executor cannot invent recipients or amounts. Durable assignments exclude a second authorization path through the other vault. Before broadcast, current source integrity, checks and chain policy must agree; afterward, settlement requires matching receipt, event, token transfer and consumed commitment.

Automatic execution is deliberately disabled on Fuji. The existing Fuji PaymentGuard deployment and credentials are preserved; this update does not claim a new Fuji payment or redeploy its contracts. Further Fuji use requires a privately configured funded relayer, the actual approver's wallet action, and sufficient testnet AVAX/test token balance. Live provider usage additionally needs API credentials. No passwords, private keys or tokens should be sent in chat.

## Small-value manual payment tests

Use Inbox → Add to inbox → Invoice and upload an unused file from `fixtures/user-tests/small-payments/`. Each trusted test invoice is **10 DEMO**. Start with NS-TEST10-0005 if you have already tried the PDF review scenarios. Follow the review result, open payment review, sign in the independent approval window, then submit the approved payment. A verified receipt confirms payment. Use the next unused invoice for another test.

The added batch is prepared in the existing Fuji, local and saved experience-demo registries/databases. Existing historical invoice amounts, signatures and receipts are preserved. New local demo suggestions select only unused 10-DEMO invoices and require separate wallet approval; previously registered automatic obligations keep their original terms. See `fixtures/user-tests/README.md` for the negative review scenarios and idempotent preparation command.
