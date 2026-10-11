# Workflow validation results

2026-10-11T06:29:54.334Z

81/100 authored scenarios passed; 100 accepted. 40 specialist analysis runs. Network attempts: 0. Payment write attempts: 0.

Invariant failures: none.

Actual authenticated API intake, file extraction, durable inbox worker, payment analysis worker, deterministic fixture agents, trusted-record checks, independent audit, persisted notifications and API result reads. Isolated temporary database/artifacts. No live provider or blockchain execution.

| ID | Channel | Classification | Outcome | Result |
| --- | --- | --- | --- | --- |
| I01 | invoice | invoice | approved | PASS |
| I02 | invoice | invoice | approved | PASS |
| I03 | invoice | invoice | approved | PASS |
| I04 | invoice | invoice | approved | PASS |
| I05 | invoice | invoice | approved | PASS |
| I06 | invoice | invoice | approved | PASS |
| I07 | invoice | invoice | approved | PASS |
| I08 | invoice | invoice | needs_review | PASS |
| I09 | invoice | invoice | needs_review | PASS |
| I10 | invoice | invoice | needs_review | PASS |
| I11 | invoice | invoice | needs_review | PASS |
| I12 | invoice | invoice | needs_review | PASS |
| I13 | invoice | invoice | needs_review | PASS |
| I14 | invoice | invoice | needs_review | PASS |
| I15 | invoice | invoice | needs_review | PASS |
| I16 | invoice | invoice | needs_review | PASS |
| I17 | invoice | invoice | needs_review | PASS |
| I18 | invoice | invoice | needs_review | PASS |
| I19 | invoice | invoice | needs_review | PASS |
| I20 | invoice | invoice | needs_review | PASS |
| I21 | invoice | invoice | quarantined | PASS |
| I22 | invoice | invoice | quarantined | PASS |
| I23 | invoice | invoice | quarantined | PASS |
| I24 | invoice | invoice | quarantined | PASS |
| I25 | invoice | invoice | quarantined | PASS |
| E01 | email | client_request | approved | PASS |
| E02 | email | client_request | needs_review | FAIL: Outcome: expected approved, observed needs_review |
| E03 | email | client_request | needs_review | FAIL: Outcome: expected approved, observed needs_review |
| E04 | email | client_request | needs_review | FAIL: Outcome: expected approved, observed needs_review |
| E05 | email | client_request | needs_review | FAIL: Outcome: expected approved, observed needs_review |
| E06 | email | general_message | needs_review | PASS |
| E07 | email | general_message | needs_review | PASS |
| E08 | email | client_request | needs_review | PASS |
| E09 | email | client_request | needs_review | PASS |
| E10 | email | client_request | needs_review | PASS |
| E11 | email | client_request | quarantined | PASS |
| E12 | email | client_request | quarantined | PASS |
| E13 | email | client_request | quarantined | PASS |
| E14 | email | client_request | quarantined | PASS |
| E15 | email | client_request | quarantined | PASS |
| E16 | email | spam | quarantined | PASS |
| E17 | email | client_request | quarantined | PASS |
| E18 | email | client_request | needs_review | FAIL: Outcome: expected approved, observed needs_review |
| E19 | email | client_request | needs_review | FAIL: Outcome: expected approved, observed needs_review |
| E20 | email | client_request | needs_review | FAIL: Outcome: expected approved, observed needs_review |
| E21 | email | client_request | quarantined | PASS |
| E22 | email | client_request | quarantined | PASS |
| E23 | email | client_request | quarantined | PASS |
| E24 | email | invoice | approved | PASS |
| E25 | email | client_request | quarantined | PASS |
| V01 | voice | client_request | needs_review | FAIL: Outcome: expected approved, observed needs_review |
| V02 | voice | client_request | needs_review | FAIL: Outcome: expected approved, observed needs_review |
| V03 | voice | client_request | needs_review | FAIL: Outcome: expected approved, observed needs_review |
| V04 | voice | client_request | needs_review | FAIL: Outcome: expected approved, observed needs_review |
| V05 | voice | client_request | needs_review | FAIL: Outcome: expected approved, observed needs_review |
| V06 | voice | general_message | needs_review | PASS |
| V07 | voice | general_message | needs_review | PASS |
| V08 | voice | client_request | needs_review | PASS |
| V09 | voice | client_request | needs_review | PASS |
| V10 | voice | client_request | needs_review | PASS |
| V11 | voice | client_request | quarantined | PASS |
| V12 | voice | client_request | quarantined | PASS |
| V13 | voice | client_request | quarantined | PASS |
| V14 | voice | client_request | quarantined | PASS |
| V15 | voice | client_request | quarantined | PASS |
| V16 | voice | spam | quarantined | PASS |
| V17 | voice | client_request | quarantined | PASS |
| V18 | voice | client_request | approved | PASS |
| V19 | voice | client_request | needs_review | PASS |
| V20 | voice | client_request | needs_review | FAIL: Outcome: expected quarantined, observed needs_review; Required security finding missing: CREDENTIAL_REQUEST |
| V21 | voice | client_request | quarantined | PASS |
| V22 | voice | invoice | approved | PASS |
| V23 | voice | client_request | quarantined | PASS |
| V24 | voice | general_message | needs_review | PASS |
| V25 | voice | client_request | quarantined | PASS |
| T01 | text | client_request | needs_review | FAIL: Outcome: expected approved, observed needs_review |
| T02 | text | client_request | needs_review | FAIL: Outcome: expected approved, observed needs_review |
| T03 | text | client_request | needs_review | FAIL: Outcome: expected approved, observed needs_review |
| T04 | text | client_request | needs_review | FAIL: Outcome: expected approved, observed needs_review |
| T05 | text | client_request | needs_review | FAIL: Outcome: expected approved, observed needs_review |
| T06 | text | general_message | needs_review | PASS |
| T07 | text | general_message | needs_review | PASS |
| T08 | text | client_request | needs_review | PASS |
| T09 | text | client_request | needs_review | PASS |
| T10 | text | client_request | needs_review | PASS |
| T11 | text | client_request | quarantined | PASS |
| T12 | text | client_request | quarantined | PASS |
| T13 | text | client_request | quarantined | PASS |
| T14 | text | client_request | quarantined | PASS |
| T15 | text | client_request | quarantined | PASS |
| T16 | text | spam | quarantined | PASS |
| T17 | text | client_request | quarantined | PASS |
| T18 | text | client_request | approved | PASS |
| T19 | text | client_request | needs_review | PASS |
| T20 | text | client_request | needs_review | FAIL: Outcome: expected quarantined, observed needs_review; Required security finding missing: CREDENTIAL_REQUEST |
| T21 | text | invoice | needs_review | PASS |
| T22 | text | general_message | needs_review | PASS |
| T23 | text | client_request | quarantined | PASS |
| T24 | text | client_request | quarantined | PASS |
| T25 | text | client_request | quarantined | PASS |

## Limitations

- Authored synthetic corpus, not a statistical measure of production fraud-detection accuracy.
- Invoice agents run their deterministic fixture implementations; live model quality, outages, latency and cost are not measured.
- Voice inputs are manual transcripts; audio transcription and speaker authentication are not tested.
- URLs are never fetched; no malware-browser or sender-authentication guarantee is made.
- Read-only chain scans are replaced by an explicit offline stub; no wallet transfer, transaction confirmation or settlement is exercised.
- No standing payment policy is installed; approved items must not create payment authority.
- Rate limiting is preserved, with reserved test IPs distributed in groups of ten.
