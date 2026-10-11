# Demo pack: automated check

Run 2026-10-11. Each file was submitted without a type (as the drop zone does) and went through the real intake, both workers, fixture agents, trusted-record checks and the final audit, using a **temporary copy** of the Fuji database (live data untouched, no network, no payment).

**12/12 files behaved as documented.**

| ID | Expected | Observed | Reason shown to the user |
| --- | --- | --- | --- |
| E1 | Approved | Approved | Cleared: routine message with no payment, account change, sensitive data or unverified link. No reply or action was sent. |
| E2 | Approved | Approved | Cleared: routine message with no payment, account change, sensitive data or unverified link. No reply or action was sent. |
| P1 | Approved | Approved | Invoice matches the trusted record for this supplier, amount and wallet. Ready for wallet approval; no payment has been sent yet. |
| P2 | Approved | Approved | Invoice matches the trusted record for this supplier, amount and wallet. Ready for wallet approval; no payment has been sent yet. |
| R1 | Needs review | Needs review | Automatic clearance stopped: Duplicate request: invoice NS-TEST10-0002 is already being processed from another inbox item ("P1-invoice-NS-TEST10-0002.pdf"). Review that item; no second payment case was created. |
| W1 | Needs review | Needs review | Payment paused: the requested payout wallet differs from the verified wallet on file for Atlas Cloud Services; the finance specialist recommended holding this payment; the finance specialist reported an unresolved discrepancy. No payment has been sent. Confirm the details with the supplier using the contact already in your records, then upload a corrected invoice. |
| W2 | Needs review | Needs review | Payment paused: the amount differs from the registered invoice amount. No payment has been sent. Confirm the details with the supplier using the contact already in your records, then upload a corrected invoice. |
| X1 | Quarantined | Quarantined | Quarantined: approval is claimed inside the message. Nothing was cleared or paid. Verify through a known contact before acting; do not open links in the message. |
| X2 | Quarantined | Quarantined | Quarantined: payment destination change requested. Nothing was cleared or paid. Verify through a known contact before acting; do not open links in the message. |
| X3 | Quarantined | Quarantined | Quarantined: instructions target the workflow. Nothing was cleared or paid. Verify through a known contact before acting; do not open links in the message. |
| X4 | Quarantined | Quarantined | Quarantined: secrecy or urgency around a payment. Nothing was cleared or paid. Verify through a known contact before acting; do not open links in the message. |
| X5 | Quarantined | Quarantined | Quarantined: phishing-style message; links require independent verification. Nothing was cleared or paid. Verify through a known contact before acting; do not open links in the message. |

The live platform runs the same rules. On the real platform the payment step for group 1 also needs your approver wallet signature and a Fuji transaction, which this check does not perform.
