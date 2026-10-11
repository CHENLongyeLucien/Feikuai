# Manual test pack: automated check

Run 2026-10-11. Each file went through the real intake, both workers, fixture agents, trusted-record checks and the final audit, using a **temporary copy** of the Fuji database (live data untouched, no network, no payment).

**27/27 files behaved as documented.**

| ID | Expected | Observed | Reason shown to the user |
| --- | --- | --- | --- |
| A1 | Approved | Approved | Invoice matches the trusted record for this supplier, amount and wallet. Ready for wallet approval; no payment has been sent yet. |
| A2 | Approved | Approved | Invoice matches the trusted record for this supplier, amount and wallet. Ready for wallet approval; no payment has been sent yet. |
| A3 | Approved | Approved | Invoice matches the trusted record for this supplier, amount and wallet. Ready for wallet approval; no payment has been sent yet. |
| A4 | Approved | Approved | Invoice matches the trusted record for this supplier, amount and wallet. Ready for wallet approval; no payment has been sent yet. |
| B1 | Approved | Approved | Invoice matches the trusted record for this supplier, amount and wallet. Ready for wallet approval; no payment has been sent yet. |
| B2 | Needs review | Needs review | Automatic clearance stopped: Duplicate request: invoice NS-TEST10-0019 is already being processed from another inbox item ("B1-original-invoice-0019.pdf"). Review that item; no second payment case was created. |
| C1 | Needs review | Needs review | This invoice has already been paid. A second payment is blocked. Use a different unpaid invoice for your next test. |
| D1 | Needs review | Needs review | Payment paused: the requested payout wallet differs from the verified wallet on file for Atlas Cloud Services; the finance specialist recommended holding this payment; the finance specialist reported an unresolved discrepancy. No payment has been sent. Confirm the details with the supplier using the contact already in your records, then upload a corrected invoice. |
| D2 | Needs review | Needs review | Payment paused: the amount differs from the registered invoice amount. No payment has been sent. Confirm the details with the supplier using the contact already in your records, then upload a corrected invoice. |
| D3 | Needs review | Needs review | Payment paused: the currency is not the DEMO token this invoice is registered in. No payment has been sent. Confirm the details with the supplier using the contact already in your records, then upload a corrected invoice. |
| D4 | Needs review | Needs review | Payment paused: required invoice details are missing or contradict each other; the amount differs from the registered invoice amount; the currency is not the DEMO token this invoice is registered in; the finance specialist recommended holding this payment. No payment has been sent. Confirm the details with the supplier using the contact already in your records, then upload a corrected invoice. |
| D5 | Needs review | Needs review | No invoice in your trusted records matches this one, so it cannot be checked or paid. Confirm it with the supplier through a known contact, or select the matching registered invoice. |
| E1 | Quarantined | Quarantined | Quarantined: approval is claimed inside the message. Nothing was cleared or paid. Verify through a known contact before acting; do not open links in the message. |
| E2 | Quarantined | Quarantined | Quarantined: payment destination change requested. Nothing was cleared or paid. Verify through a known contact before acting; do not open links in the message. |
| E3 | Quarantined | Quarantined | Quarantined: instructions target the workflow. Nothing was cleared or paid. Verify through a known contact before acting; do not open links in the message. |
| E4 | Quarantined | Quarantined | Quarantined: phishing-style message; links require independent verification. Nothing was cleared or paid. Verify through a known contact before acting; do not open links in the message. |
| E5 | Quarantined | Quarantined | Quarantined: secrecy or urgency around a payment. Nothing was cleared or paid. Verify through a known contact before acting; do not open links in the message. |
| E6 | Quarantined | Quarantined | Quarantined: instructions target the workflow. Nothing was cleared or paid. Verify through a known contact before acting; do not open links in the message. |
| E7 | Quarantined | Quarantined | Quarantined: instructions target the workflow; disguised characters. Nothing was cleared or paid. Verify through a known contact before acting; do not open links in the message. |
| E8 | Quarantined | Quarantined | Quarantined: sensitive credential request. Nothing was cleared or paid. Verify through a known contact before acting; do not open links in the message. |
| E9 | Quarantined | Quarantined | Quarantined: secrecy or urgency around a payment. Nothing was cleared or paid. Verify through a known contact before acting; do not open links in the message. |
| F1 | Approved | Approved | Cleared: routine message with no payment, account change, sensitive data or unverified link. No reply or action was sent. |
| F2 | Approved | Approved | Cleared: routine message with no payment, account change, sensitive data or unverified link. No reply or action was sent. |
| F3 | Needs review | Needs review | A request to move money, change pay or commit to a contract needs a person to verify scope and authority. |
| F4 | Needs review | Needs review | The source contains a link that no isolated scanner has checked; a person must review it before clearance. |
| G1 | Rejected at upload | Rejected at upload | SCANNED_PDF_UNSUPPORTED: PDF has no selectable text; provide a text-based invoice. |
| G2 | Needs review | Needs review | Automatic clearance stopped: Email contains an uninspected application/zip part. Supply its relevant content in a supported text or PDF source. |

The live platform runs the same rules. On the real platform the payment step for group 1 also needs your approver wallet signature and a Fuji transaction, which this check does not perform.
