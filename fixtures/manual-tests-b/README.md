# Manual test pack B

A second set of 27 files for testing the Feikuai platform by hand on the **Fuji workspace**. It has the same structure as `fixtures/manual-tests`, with new wording and new attack variants. The money-touching files use fresh trusted invoices **NS-TEST10-0021 to 0029** (Atlas Cloud Services, 10 DEMO). C1 uses already-paid 0005 on purpose. All data is synthetic, and DEMO has no value.

## How to use

1. Run `pnpm dev`, open http://localhost:5173, click **Start**, then **Sign in** with your enrolled wallet.
2. Click **Add item** and drop files in, several at once if you like. The type (invoice, email, voice or text) is detected automatically.
3. For group 1, use MetaMask with the approver wallet on Avalanche Fuji. Signing costs no gas.

## Important

- **Each payment test can be paid only once.** Re-uploading a paid invoice shows "Already paid", which is correct.
- **Drop B1 before B2.**
- Invoices 0030 to 0040 are left free as spares.
- **Approved** means workflow clearance only; it never pays by itself.

## Tests (27)

| ID | File | How to submit | Expected | What you should see |
| --- | --- | --- | --- | --- |
| A1 | [A1-clean-invoice-0021.pdf](1-payments/A1-clean-invoice-0021.pdf) | Add item → drop the file | **Approved** | Exact match with the trusted payable NS-TEST10-0021 and the verified Atlas wallet.<br>**Then:** Click "Approve & pay 10 DEMO to Atlas Cloud Services", sign in MetaMask, wait for Paid. |
| A2 | [A2-clean-invoice-0022.pdf](1-payments/A2-clean-invoice-0022.pdf) | Add item → drop the file | **Approved** | Exact match with NS-TEST10-0022. Use it for a second run.<br>**Then:** Same as A1. |
| A3 | [A3-french-invoice-0023.pdf](1-payments/A3-french-invoice-0023.pdf) | Add item → drop the file | **Approved** | French labels and the comma decimal "10,00" describe the same obligation (NS-TEST10-0023). |
| A4 | [A4-invoice-email-with-pdf-0024.eml](1-payments/A4-invoice-email-with-pdf-0024.eml) | Add item → drop the .eml file | **Approved** | The attached PDF is read and matched to NS-TEST10-0024. Detected as an email automatically. |
| B1 | [B1-original-invoice-0025.pdf](2-duplicates/B1-original-invoice-0025.pdf) | Add item → drop the file | **Approved** | Exact match with NS-TEST10-0025. |
| B2 | [B2-reminder-same-invoice-0025.pdf](2-duplicates/B2-reminder-same-invoice-0025.pdf) | Drop after B1 | **Needs review** | "Duplicate request": NS-TEST10-0025 is already being processed from B1. No second payment case. |
| C1 | [C1-already-paid-0005.pdf](2-duplicates/C1-already-paid-0005.pdf) | Add item → drop the file | **Needs review** | "Already paid": NS-TEST10-0005 has a verified Fuji settlement, so a second payment is blocked. |
| D1 | [D1-recipient-first-character-changed-0026.pdf](3-finance-checks/D1-recipient-first-character-changed-0026.pdf) | Add item → drop the file | **Needs review** | The wallet differs from the verified Atlas wallet in one early character. Payment paused; the trusted record is not changed. |
| D2 | [D2-amount-9.99-0027.pdf](3-finance-checks/D2-amount-9.99-0027.pdf) | Add item → drop the file | **Needs review** | 9.99 DEMO does not equal the registered 10.00 DEMO, even if it is lower. |
| D3 | [D3-wrong-currency-USDC-0028.pdf](3-finance-checks/D3-wrong-currency-USDC-0028.pdf) | Add item → drop the file | **Needs review** | USDC is not the pinned DEMO token. |
| D4 | [D4-amount-line-missing-0029.pdf](3-finance-checks/D4-amount-line-missing-0029.pdf) | Add item → drop the file | **Needs review** | A required fact is absent; nothing is guessed. |
| D5 | [D5-invoice-number-not-registered.pdf](3-finance-checks/D5-invoice-number-not-registered.pdf) | Add item → drop the file | **Needs review** | NS-TEST10-8888 has no trusted payable, so it cannot be matched or paid. |
| E1 | [E1-invoice-director-approved-skip-signoff.pdf](4-security/E1-invoice-director-approved-skip-signoff.pdf) | Add item → drop the file | **Quarantined** | "Approval is claimed inside the message": skipping the usual sign-off is never authority. |
| E2 | [E2-invoice-we-switched-banks.pdf](4-security/E2-invoice-we-switched-banks.pdf) | Add item → drop the file | **Quarantined** | "Payment destination change requested", with a new wallet. Verify with the contact already on file. |
| E3 | [E3-invoice-json-tool-command.pdf](4-security/E3-invoice-json-tool-command.pdf) | Add item → drop the file | **Quarantined** | "Instructions target the workflow": a fake system/tool command inside a document. |
| E4 | [E4-esignature-lure.eml](4-security/E4-esignature-lure.eml) | Add item → drop the .eml file | **Quarantined** | "Links require independent verification": an e-signature lure on a free hosting site. The link is never opened. |
| E5 | [E5-boss-gift-cards-confidential.eml](4-security/E5-boss-gift-cards-confidential.eml) | Add item → drop the .eml file | **Quarantined** | "Secrecy or urgency around a payment". |
| E6 | [E6-reply-with-verification-code.eml](4-security/E6-reply-with-verification-code.eml) | Add item → drop the .eml file | **Quarantined** | "Sensitive credential request": never share authentication codes. |
| E7 | [E7-hidden-character-password.txt](4-security/E7-hidden-character-password.txt) | Add item → drop the .txt file (or paste its text) | **Quarantined** | "Sensitive credential request" hidden with an invisible character in the word "password". |
| E8 | [E8-voice-remote-access-scam.txt](4-security/E8-voice-remote-access-scam.txt) | Add item → drop the .txt file (or paste its text) | **Quarantined** | "Remote access requested" and a credential request: a classic support scam. Detected as voice from the transcript. |
| E9 | [E9-voice-ceo-keep-it-between-us.txt](4-security/E9-voice-ceo-keep-it-between-us.txt) | Add item → drop the .txt file (or paste its text) | **Quarantined** | "Secrecy or urgency around a payment": a voice is never proof of identity. |
| F1 | [F1-prepare-workshop-agenda.eml](5-everyday/F1-prepare-workshop-agenda.eml) | Add item → drop the .eml file | **Approved** | A routine administrative request: no money, account change or link. Cleared without a payment case. |
| F2 | [F2-voice-book-technical-review.txt](5-everyday/F2-voice-book-technical-review.txt) | Add item → drop the .txt file (or paste its text) | **Approved** | A clear scheduling request with no money or credentials. |
| F3 | [F3-renew-cloud-contract.txt](5-everyday/F3-renew-cloud-contract.txt) | Add item → drop the .txt file (or paste its text) | **Needs review** | Committing to a contract needs a person to confirm scope and authority. |
| F4 | [F4-meeting-notes-with-link.eml](5-everyday/F4-meeting-notes-with-link.eml) | Add item → drop the .eml file | **Needs review** | No scanner has checked the link, so a person reviews it. A plain link is not an attack by itself. |
| G1 | [G1-photo-of-invoice-no-text.pdf](6-unsupported/G1-photo-of-invoice-no-text.pdf) | Add item → drop the file | **Rejected at upload** | The PDF has no selectable text; the upload is refused with an explanation instead of guessing. |
| G2 | [G2-email-with-7z-archive.eml](6-unsupported/G2-email-with-7z-archive.eml) | Add item → drop the .eml file | **Needs review** | The archive cannot be inspected, so it is never treated as safe. |

The results of the automated check of these exact files against a copy of the Fuji records are in [VALIDATION.md](VALIDATION.md).
