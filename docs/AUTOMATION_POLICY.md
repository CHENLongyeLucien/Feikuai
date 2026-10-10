# Isolated demonstration payment policy

`AutomationGuard` is a separate standing-authority vault. It does not change any deployed `PaymentGuard` or Fuji policy. The isolated demo launcher deploys it with a distinct executor and registers five synthetic invoices (`BENIGN-01` through `BENIGN-05`) from the trusted registry using the policy owner's account.

Registration authorizes those exact invoice keys, supplier keys, recipients and amounts once each. The executor cannot register obligations, alter terms, choose arbitrary destinations or exceed the lifetime budget. The configured per-payment maximum is 50,000 DEMO; the lifetime registered budget is 300,000 DEMO. Each execution requires a nonzero final-audit commitment. The contract anchors that commitment but cannot independently evaluate the business truth of the audit; the backend must run its independent checks before executing.

The policy owner and executor are immutable and distinct. Supplier mappings are sorted and immutable. Every registration and payment emits an audit event. Transfers use SafeERC20, a reentrancy guard and exact sender/recipient balance-delta checks; failed transfers roll back settlement consumption and the spent budget. There is no upgrade, withdrawal, allowance or alternate transfer route.

The two vaults have independent consumption mappings. An invoice registered with `AutomationGuard` must be reserved for that route: the application must never export a human `PaymentGuard` authorization for that invoice. Already-exported human signatures cannot be revoked by an application routing change. The isolated demo reserves other invoices, including `BENIGN-06`, for human wallet review.

The guided human flow opens a separate approval origin, independently verifies the pinned policy and supplier records, and requests an explicit wallet signature. A window-bound channel checks the exact sender origin, source window, protocol and unpredictable request nonce. The returned signature is still untrusted until the API verifies it. Execution remains a separate explicit action. File export/import remains available as a fallback.

Actual checks on 2026-10-11: 45/45 Foundry tests passed (15 new automation tests plus the existing 30, including 256-run fuzz tests and 2,048 invariant calls). Bridge and guidance unit tests passed 11/11. TypeScript and both Vite production builds passed. Full Foundry output is in `automation-contract-results.log`. The real browser bridge test in `tests/e2e/bridge.spec.ts` passed 1/1 in 12.2 seconds: the explicit wallet signature returned across the two origins, transaction `0x2a9712af6c68b385b1c4ccce3f1a4f5ddafa3be0e2e3081deacfec7a2a60dcd9` succeeded, and the supplier balance increased by exactly 48,000,000,000 atomic units (48,000 DEMO). There were no browser errors. Results are recorded in `qa/approval-bridge-results.json` and `qa/guided-payment-result.json`.

Commands:

```sh
node scripts/foundry.mjs forge test --root contracts -vv
node node_modules/vitest/vitest.mjs run apps/web/src/features/cases/approval-bridge.test.ts apps/web/src/features/cases/review-guide.test.ts
node node_modules/@playwright/test/cli.js test --config tests/e2e/bridge.config.ts
```

The test demo uses public local Anvil identities and valueless tokens. Enabling standing authority on Fuji would require a separately reviewed policy, deployment, owner-signed registration, executor credentials and testnet gas/funding. The existing Fuji vault continues to require its human EIP-712 signature.
