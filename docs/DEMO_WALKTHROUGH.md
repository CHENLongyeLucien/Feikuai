# Mentor walkthrough

Use the saved local chain and fixture-labelled app for the recorded demonstration. Start `pnpm chain:local`, then `pnpm dev` in another terminal. Follow RUNBOOK.md for a fresh machine. Main app: http://localhost:5173; approver: http://localhost:5174.

1. Show the campus overview, zoom/rotate, select a building, agent and case. Explain that carrier/packet motion is a read-only projection of application and chain observations.
2. Connect the isolated local approver/operator wallet (account 1) and sign the SIWE login challenge. Explain that this login has no payment authority.
3. Open an unused BENIGN payable, upload its provided invoice and inspect both fixture-labelled agent artifacts, source spans and current-record checks. Previously settled keys remain settled.
4. Freeze/export the request. Open it in the independent approver and review the exact invoice, token, recipient, amount, nonce, expiry, commitment and pinned registry. Sign with the human-controlled approval wallet and export the signature.
5. Import the signature and request execution. Show pending/unknown truthfully; only a matching successful receipt closes the case. Export evidence and demonstrate offline versus pinned online verification.
6. Show ATTACK-01's beneficiary mismatch hold and ATTACK-02's forged CFO prose. No statement in an invoice can replace the wallet signature.
7. Show cancellation with an unused request. Explain that a confirmed payment cannot be undone by later cancellation. Review actual recovery/negative-transaction logs rather than claiming the screen animation enforces payment.
8. Show the business calculator:€1,500 pilot and€490 monthly are price hypotheses. Change labor/CAC/churn and show break-even or no positive contribution. No live model cost, human review time, paying customer or profit is claimed.

Actual built-app recording: `docs/qa/actual-payment-workflow.webm`. This records an automated local test wallet with real local transfer; it is not evidence of a genuine human Fuji approval. Fuji remains blocked on the wallet/funding/configuration steps in RUNBOOK.md.
