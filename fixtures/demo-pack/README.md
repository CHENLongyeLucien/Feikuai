# Demo pack (4-minute judge demo)

New files for the live demo on the **Fuji workspace**. They're separate from `fixtures/manual-tests` and use the spare invoices NS-TEST10-0002, 0003, 0004 and 0020, so a rehearsal with the manual pack doesn't spoil them.

## Running order

1. **Drop the whole `1-drop-all-at-once` folder** with **Add item**. The type of each file is detected automatically, and the batch tracker shows every file going through the checks live.
   - Point at **W1** (*payment paused*: wallet changed) and **X1** (*quarantined*: fake approval).
   - Mention that **E1 and E2 are cleared**: the system doesn't block everything.
2. **Drop `P1`**, then click **Approve & pay 10 DEMO to Atlas Cloud Services**, sign in MetaMask and wait for **Paid**.
3. *(Optional)* Drop **R1** to show the same invoice can't be paid twice.

## Important

- **P1 can be paid only once.** If the payment fails or you need a retake, use **P2**. After the demo, regenerate the pack on other unused invoices before demoing again: `pnpm fixtures:demo`, after editing the invoice numbers.
- **Rehearse with `fixtures/manual-tests`, not with these files.** Using these files in a rehearsal links their invoices and would change the demo outcomes.
- **If you rehearse with this pack anyway,** clear the platform afterwards with `pnpm history:reset var/fuji/secure-finance.sqlite var/fuji/artifacts --yes` (server stopped) and use P2 for the live payment.

| ID | File | Expected | What the judges see |
| --- | --- | --- | --- |
| W1 | W1-invoice-wallet-changed.pdf | **Needs review** | "Payment paused": the wallet differs from the verified Atlas wallet by one character. |
| W2 | W2-invoice-wrong-amount.pdf | **Needs review** | "Payment paused": the amount differs from the registered 10.00 DEMO. |
| X1 | X1-invoice-ceo-already-approved.pdf | **Quarantined** | "Approval is claimed inside the message": a sentence in a document is not authority. |
| X2 | X2-email-bank-details-changed.eml | **Quarantined** | "Payment destination change requested": verify through the contact already on file. |
| X3 | X3-email-invoice-hidden-ai-instruction.eml | **Quarantined** | "Instructions target the workflow": text aimed at the AI has no authority. |
| X4 | X4-voice-cfo-on-a-flight.txt | **Quarantined** | "Secrecy or urgency around a payment": a voice is never proof of identity. |
| X5 | X5-email-mailbox-phishing.eml | **Quarantined** | "Phishing-style message" with a look-alike login link; the link is never opened. |
| E1 | E1-email-meeting-request.eml | **Approved** | Cleared automatically: no money, account change, link or sensitive data. Shows the system does not block everything. |
| E2 | E2-voice-schedule-call.txt | **Approved** | Cleared automatically: a clear scheduling request with no payment or credentials. |
| P1 | P1-invoice-NS-TEST10-0002.pdf | **Approved** | Exact match with the trusted record.<br>**Then:** Click "Approve & pay 10 DEMO to Atlas Cloud Services", sign in MetaMask, wait for Paid (receipt verified on Fuji). |
| P2 | P2-backup-invoice-NS-TEST10-0003.pdf | **Approved** | Exact match with the trusted record; a second, unused invoice for a retake. |
| R1 | R1-same-invoice-sent-again.pdf | **Needs review** | Blocked: "Duplicate request" while P1 is in progress, or "Already paid" once P1 is paid. |

The results of the automated check of these exact files against a copy of the Fuji records are in [VALIDATION.md](VALIDATION.md).
