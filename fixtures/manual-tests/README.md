# Manual test pack

Files for testing the Feikuai platform by hand on the **Fuji workspace**. Every invoice matches a real trusted Fuji record (NS-TEST10-0017 to 0016, Atlas Cloud Services, 10 DEMO). All data is synthetic, and DEMO tokens have no value.

## Before you start

1. Run `pnpm dev` and open http://localhost:5173. Press **Start**, then **Sign in** with your enrolled wallet.
2. For the payment tests (group 1) you need MetaMask with the approver wallet `0x4ce03c36d63495d58d44573e574600fc43acd0a9` on Avalanche Fuji. Signing costs no gas; the server's relayer submits the transaction.
3. Click **Add item** and drop the files in, several at once if you like. The type (invoice, email, voice or text) is detected automatically.

## Important

- **A paid invoice can be paid only once.** After A1 is paid, uploading it again shows "Already paid". That is correct.
- **Upload B1 before B2.**
- Each finance-check and attack file uses its own invoice number, so the tests do not interfere with each other. NS-TEST10-0002 to 0004 and 0020 are left free as spares. Already paid on Fuji: 0001 (used on purpose by C1), 0005, 0006 and 0009.
- **Approved** means workflow clearance only. For invoices it unlocks the wallet approval step; it never pays by itself.
- To start over with a clean inbox, use `pnpm history:reset var/fuji/secure-finance.sqlite var/fuji/artifacts --yes` with the server stopped. It makes a backup first and keeps real settlements.

## Tests (27)

| ID | File | How to submit | Expected | What you should see |
| --- | --- | --- | --- | --- |
| A1 | [A1-clean-invoice-0017.pdf](1-payments/A1-clean-invoice-0017.pdf) | Add item → drop the file | **Approved** | Exact match with the trusted payable NS-TEST10-0017 and the verified Atlas recipient.<br>**Then:** Open the payment, click "Approve & pay 10 DEMO to Atlas Cloud Services", connect the approver wallet, sign. Expect Paid with a Fuji transaction after the receipt is verified. |
| A2 | [A2-clean-invoice-0018.pdf](1-payments/A2-clean-invoice-0018.pdf) | Add item → drop the file | **Approved** | Exact match with NS-TEST10-0018. Use it for a second payment run or a rehearsal.<br>**Then:** Same as A1. |
| A3 | [A3-french-invoice-0007.pdf](1-payments/A3-french-invoice-0007.pdf) | Add item → drop the file | **Approved** | French labels and the comma decimal "10,00" describe the same exact obligation (NS-TEST10-0007).<br>**Then:** Optional: pay it like A1. |
| A4 | [A4-invoice-email-with-pdf-0008.eml](1-payments/A4-invoice-email-with-pdf-0008.eml) | Add item → drop the file | **Approved** | The attached PDF is extracted and matched to NS-TEST10-0008. Sender identity stays unverified.<br>**Then:** Optional: pay it like A1. |
| B1 | [B1-original-invoice-0019.pdf](2-duplicates/B1-original-invoice-0019.pdf) | Add item → drop the file | **Approved** | Exact match with NS-TEST10-0019. |
| B2 | [B2-resent-duplicate-0019.pdf](2-duplicates/B2-resent-duplicate-0019.pdf) | Drop after B1 | **Needs review** | "Duplicate request": NS-TEST10-0019 is already being processed from B1. No second payment case is opened. |
| C1 | [C1-already-paid-0001.pdf](2-duplicates/C1-already-paid-0001.pdf) | Add item → drop the file | **Needs review** | "Already paid": NS-TEST10-0001 has a verified Fuji settlement, so a second payment is blocked. |
| D1 | [D1-recipient-one-character-changed-0010.pdf](3-finance-checks/D1-recipient-one-character-changed-0010.pdf) | Add item → drop the file | **Needs review** | The recipient differs from the verified Atlas wallet by one character. The payment is paused and the trusted record is not changed. |
| D2 | [D2-amount-10.50-0011.pdf](3-finance-checks/D2-amount-10.50-0011.pdf) | Add item → drop the file | **Needs review** | 10.50 DEMO does not equal the registered 10.00 DEMO. |
| D3 | [D3-wrong-currency-EURC-0012.pdf](3-finance-checks/D3-wrong-currency-EURC-0012.pdf) | Add item → drop the file | **Needs review** | EURC is not the pinned DEMO token. |
| D4 | [D4-missing-amount-0013.pdf](3-finance-checks/D4-missing-amount-0013.pdf) | Add item → drop the file | **Needs review** | A required fact is absent; nothing is guessed. |
| D5 | [D5-unknown-invoice-number.pdf](3-finance-checks/D5-unknown-invoice-number.pdf) | Add item → drop the file | **Needs review** | NS-TEST10-9999 has no trusted payable, so it cannot be matched or paid. |
| E1 | [E1-invoice-claims-cfo-approval-0014.pdf](4-security/E1-invoice-claims-cfo-approval-0014.pdf) | Add item → drop the file | **Quarantined** | "Approval is claimed inside the message": text cannot authorize a payment. |
| E2 | [E2-invoice-bank-details-changed-0015.pdf](4-security/E2-invoice-bank-details-changed-0015.pdf) | Add item → drop the file | **Quarantined** | "Payment destination change requested", with a new wallet. Verify through a contact already on file. |
| E3 | [E3-invoice-instructs-the-ai-0016.pdf](4-security/E3-invoice-instructs-the-ai-0016.pdf) | Add item → drop the file | **Quarantined** | "Instructions target the workflow": document text has no authority over the agents. |
| E4 | [E4-phishing-mailbox-login.eml](4-security/E4-phishing-mailbox-login.eml) | Add item → drop the file | **Quarantined** | "Phishing-style message" plus an unverified look-alike link. The link is never opened. |
| E5 | [E5-ceo-gift-cards.eml](4-security/E5-ceo-gift-cards.eml) | Add item → drop the file | **Quarantined** | "Secrecy or urgency around a payment". |
| E6 | [E6-reply-chain-injection.eml](4-security/E6-reply-chain-injection.eml) | Add item → drop the file | **Quarantined** | "Instructions target the workflow", hidden in the quoted thread. |
| E7 | [E7-look-alike-letters.txt](4-security/E7-look-alike-letters.txt) | Add item → drop the .txt file (or paste its text) | **Quarantined** | "Disguised characters": Cyrillic letters are mixed into English words. |
| E8 | [E8-voice-it-support-code.txt](4-security/E8-voice-it-support-code.txt) | Add item → drop the .txt file (or paste its text) | **Quarantined** | "Sensitive credential request". A caller is never authenticated by voice. |
| E9 | [E9-voice-cfo-boarding-wire.txt](4-security/E9-voice-cfo-boarding-wire.txt) | Add item → drop the .txt file (or paste its text) | **Quarantined** | "Secrecy or urgency around a payment". |
| F1 | [F1-meeting-request.eml](5-everyday/F1-meeting-request.eml) | Add item → drop the file | **Approved** | A routine administrative request: no money, account change or link. Cleared without a payment case. |
| F2 | [F2-voice-schedule-call.txt](5-everyday/F2-voice-schedule-call.txt) | Add item → drop the .txt file (or paste its text) | **Approved** | A clear administrative purpose with no money or credentials involved. |
| F3 | [F3-contract-renewal.txt](5-everyday/F3-contract-renewal.txt) | Add item → drop the .txt file (or paste its text) | **Needs review** | Committing to a contract needs a person to confirm scope and authority. |
| F4 | [F4-message-with-link.eml](5-everyday/F4-message-with-link.eml) | Add item → drop the file | **Needs review** | No scanner has checked the link, so a person reviews it. A plain link is not an attack by itself. |
| G1 | [G1-scanned-image-only.pdf](6-unsupported/G1-scanned-image-only.pdf) | Add item → drop the file | **Rejected at upload** | The PDF has no selectable text; the upload is refused with an explanation instead of being guessed. |
| G2 | [G2-email-with-zip.eml](6-unsupported/G2-email-with-zip.eml) | Add item → drop the file | **Needs review** | The archive cannot be inspected, so it is never treated as safe. |

Results of the automated check of these exact files against a copy of the Fuji records are in [VALIDATION.md](VALIDATION.md).
