# Feikuai: defense sheet

**Track 1, Fintech Security: Guardians of Value.** Supplier-payment controls for finance teams that use AI agents and pay suppliers in stablecoins.

## Threat scenario

A supplier request that looks credible reaches accounts payable. It may redirect an existing invoice to a new wallet, falsely claim that the CFO approved it, hide instructions aimed at the AI agents, or lure a credential. The goal is a payment the company does not owe, or owes to someone else.

Feikuai reads the request, checks it, and compares it with trusted records:
- **Discrepancies:** the payment is paused or the source is quarantined, with a plain reason.
- **Legitimate invoices:** a human signs the exact terms.
- **Execution:** an Avalanche contract enforces those terms and refuses double payment.
- **Paid:** shown only after the receipt is verified.

## NIST CSF 2.0 functions

| Function | How |
| --- | --- |
| **Detect** (main) | Security rules, AI extraction, and checks against trusted records at each of the eight stages |
| **Respond** (main) | Graduated response (clear, review, pause, quarantine), alerts, and a playbook ([RESPONSE_PLAYBOOK.md](RESPONSE_PLAYBOOK.md)) |
| **Protect** | Human signature for every payment; on-chain limits, recipient mapping and replay protection; final pre-execution audit |
| **Govern** | Separated authority (agents read, people sign, contract enforces); auditable evidence; DORA draft support |
| **Identify** | Trusted registry of suppliers and payables; a token-scoped identity for each integration |

## Techniques and risks addressed

- **MITRE ATT&CK:**
  - T1566 Phishing, including .001 attachment and .002 link
  - T1598 Phishing for Information (credentials, codes, seed phrases)
  - T1656 Impersonation (CEO or CFO fraud, vishing)
  - T1204 User Execution (archives, executable content)
  - T1036 Masquerading (look-alike characters, look-alike domains)
- **MITRE ATLAS:** AML.T0051 LLM Prompt Injection, direct and indirect, through invoices, emails and quoted replies.
- **OWASP Agentic Top 10:**
  - ASI01 Goal Hijack
  - ASI02 Tool Misuse: agents have read-only tools
  - ASI03 Identity and Privilege Abuse: no agent or API key can authorize a payment
  - ASI07 Insecure Inter-Agent Communication: each stage re-checks the previous one; nothing is trusted on its word

## Metrics achieved

Measured on 11 October 2026 through the real pipeline, with no live LLM (deterministic agents).

| Measure | Held-out real data¹ | Synthetic payment fraud² |
| --- | --- | --- |
| Precision of security alerts | **96.9%** (95% CI 95.9–97.7) | 100% |
| False-positive rate | **1.5%** (CI 1.1–2.0); 1.7% on real business email | 0% |
| Recall (quarantine) | **74.0%** (CI 71.9–75.9) | 69.3% |
| Attacks *not* auto-cleared (quarantined or sent to a person) | **97.5%** (46 of 1,821 auto-cleared, all generic phishing) | **100%** |
| Time to detect, pipeline only | median **10.6 ms**, p95 16 ms | |
| Time to detect, real worker, steady traffic | median **0.63 s**, p95 0.96 s; under a burst of 100: median 12.5 s | |
| Time to respond | Same moment as detection: the hold or quarantine and the alert are written with the decision | |
| Payment authority created by an attack | **0**, in every test and in 79 contract tests | |
| Before vs after (same 474 attacks that evaded detection, real local chain) | Unguarded agent with a funded wallet: **474 of 474 paid the attacker, 4,896.1 DEMO lost** | Feikuai: **0 of 1,896 worst-case attempts paid the attacker** ([chain-escape.json](results/chain-escape.json)) |

Real Fuji payments through the full flow (upload → checks → Approve & pay → MetaMask signature → contract → verified receipt): NS-TEST10-0005 [tx 0xeabc41cd…6d88](https://testnet.snowtrace.io/tx/0xeabc41cd969c6792f3fed6e4c2b7c993c7fcbef66b0eefea21923b0c67616d88) and NS-TEST10-0009 [tx 0xdf73e231…9888](https://testnet.snowtrace.io/tx/0xdf73e2310e0c0f8be105e7e5f83943237b61fc4cc9234826a7f0efe238699888), 11 October 2026, both status 1 on PaymentGuard `0x667ef97b213cfbe3f89ed2fe835c16d11acf6914`. Re-submitting either invoice is blocked as *already paid*.

¹ 4,645 held-out items: 2,521 Enron business emails, 1,541 Nazario phishing emails (2021–2025) and 583 synthetic accounts-payable attacks. Rules were tuned only on the separate dev split. Files: [docs/results/detection-benchmark-heldout.json](results/detection-benchmark-heldout.json) and [docs/results/detection-benchmark-live-latency.json](results/detection-benchmark-live-latency.json).

² 100-input workflow corpus v2: 100/100 correct outcomes. It is also the development set, so it is optimistic. See [workflow-validation-v2](workflow-validation-v2/README.md).

## Known limitations

- **Recall misses.** About 1 in 4 real phishing emails is not quarantined. Most go to human review, but 46 of 1,821 were auto-cleared as routine mail. Misses include a French credential request and an indirectly worded account redirection.
- **Base rate.** At a realistic 1% attack rate, the measured precision falls to about 33%. The system triages for analysts; it does not replace them.
- **No live LLM measured.** The agents ran deterministically; the AI provider had no credits during testing. When the provider fails, items are held, never cleared.
- **Not built.** No URL or attachment sandbox (links are never opened; archives are held). No sender authentication. No voice-clone detection.
- **Contract scope.** Only suppliers registered in the deployed contract can be paid. Status updates are not pushed to an ERP; it must poll.
- **Human error.** A person can still be deceived into signing terms that pass every rule. The contract stops other recipients and double payment, not a mistaken human approval.
- **Test environment.** Synthetic data and a valueless DEMO token on the Fuji testnet. Not production-ready.

**What if the model is wrong?** It cannot pay: it only reads. Checks compare its output with trusted records, a person signs the exact terms, and the contract enforces them. Responsibility stays with the company's policy owner and its approver.
