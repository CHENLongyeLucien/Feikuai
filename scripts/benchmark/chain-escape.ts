// Defense-in-depth test: every attack that was NOT quarantined by the detection benchmark
// is replayed as a worst-case payment attempt against real PaymentGuard and AutomationGuard
// contracts on an isolated local Anvil chain.
//
// Threat model: the attacker's message evaded detection AND the attacker controls the
// downstream automation (agents, API server, relayer key, automation executor key). The
// attacker does NOT hold the human approver's wallet key. A3 additionally assumes the
// human approver was deceived into signing the attacker's terms.
// Usage: pnpm benchmark:chain   (after pnpm benchmark:detection)
import {spawn, type ChildProcess} from 'node:child_process';
import {readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {BaseError, ContractFunctionRevertedError, createPublicClient, createWalletClient, http, keccak256, toHex, type Address, type Hex} from 'viem';
import {foundry} from 'viem/chains';
import {mnemonicToAccount, privateKeyToAccount} from 'viem/accounts';
import {demoTokenAbi, paymentGuardAbi} from '../../packages/chain/src/index.js';
import {openSystem, type Row} from './detection.js';

const rpc = 'http://127.0.0.1:28545', MNEMONIC = 'test test test test test test test test test test test junk';
const account = (i: number) => mnemonicToAccount(MNEMONIC, {addressIndex: i});
const [owner, approver, relayer, , , executor] = [0, 1, 2, 3, 4, 5].map(account) as ReturnType<typeof account>[];
const out = resolve('var/benchmark-results');

function run(args: string[]) {return new Promise<void>((ok, fail) => {const c = spawn(process.execPath, ['scripts/foundry.mjs', ...args], {stdio: 'inherit'}); c.once('exit', code => code === 0 ? ok() : fail(new Error(`${args.join(' ')} failed`)));});}

const client = createPublicClient({chain: foundry, transport: http(rpc), pollingInterval: 50});
const wallet = createWalletClient({chain: foundry, transport: http(rpc)});
async function mined(hash: Hex) {return client.waitForTransactionReceipt({hash, pollingInterval: 50});}
function revertName(error: unknown) {
  if (error instanceof BaseError) {const e = error.walk(x => x instanceof ContractFunctionRevertedError); if (e instanceof ContractFunctionRevertedError) return e.data?.errorName ?? e.signature ?? 'UnknownRevert';}
  return `NotAContractRevert: ${String((error as Error)?.message ?? error).slice(0, 120)}`;
}

let anvil: ChildProcess | undefined;
try {
  await run(['forge', 'build', '--root', 'contracts', '--quiet']);
  anvil = spawn(process.execPath, ['scripts/foundry.mjs', 'anvil', '--host', '127.0.0.1', '--port', '28545', '--chain-id', '31337', '--hardfork', 'cancun', '--silent'], {stdio: 'ignore'});
  for (let i = 0; i < 100; i++) {try {if (await client.getChainId() === 31337) break;} catch {/* starting */} await new Promise(r => setTimeout(r, 100));}

  // Same registry the detection benchmark used.
  const ctx = await openSystem();
  const payables = ctx.registry.payables as any[];
  await ctx.close();
  const suppliers = [...new Map(payables.map(p => [p.supplierKey, p.recipient as Address])).entries()].sort((a, b) => a[0].localeCompare(b[0]));

  const tokenArtifact = JSON.parse(readFileSync('contracts/out/DemoToken.sol/DemoToken.json', 'utf8'));
  const guardArtifact = JSON.parse(readFileSync('contracts/out/PaymentGuard.sol/PaymentGuard.json', 'utf8'));
  const autoArtifact = JSON.parse(readFileSync('contracts/out/AutomationGuard.sol/AutomationGuard.json', 'utf8'));
  const token = (await mined(await wallet.deployContract({account: owner, abi: demoTokenAbi, bytecode: tokenArtifact.bytecode.object, args: [owner.address]}))).contractAddress!;
  const vault = (await mined(await wallet.deployContract({account: owner, abi: paymentGuardAbi, bytecode: guardArtifact.bytecode.object, args: [token, approver.address, 50000000000n, 600n, suppliers.map(s => s[0] as Hex), suppliers.map(s => s[1])]}))).contractAddress!;
  const automation = (await mined(await wallet.deployContract({account: owner, abi: autoArtifact.abi, bytecode: autoArtifact.bytecode.object, args: [token, owner.address, executor.address, 50000000000n, 300000000000n, suppliers.map(s => s[0] as Hex), suppliers.map(s => s[1])]}))).contractAddress!;
  const registered = payables.filter(p => /^BENIGN-0[1-5]$/.test(p.scenarioId));
  await mined(await wallet.writeContract({account: owner, address: automation, abi: autoArtifact.abi, functionName: 'registerObligations', args: [registered.map(p => ({invoiceKey: p.invoiceKey, supplierKey: p.supplierKey, recipient: p.recipient, amountAtomic: BigInt(p.amountAtomic)}))]}));
  for (const target of [vault, automation]) await mined(await wallet.writeContract({account: owner, address: token, abi: demoTokenAbi, functionName: 'transfer', args: [target, 300000000000n]}));
  const policyId = await client.readContract({address: vault, abi: paymentGuardAbi, functionName: 'policyId'});
  const balance = (who: Address) => client.readContract({address: token, abi: demoTokenAbi, functionName: 'balanceOf', args: [who]});
  const domain = {name: 'SecureFinancePaymentGuard', version: '1', chainId: 31337, verifyingContract: vault} as const;
  const types = {Payment: [{name: 'invoiceKey', type: 'bytes32'}, {name: 'supplierKey', type: 'bytes32'}, {name: 'recipient', type: 'address'}, {name: 'token', type: 'address'}, {name: 'amountAtomic', type: 'uint256'}, {name: 'authorizationNonce', type: 'uint256'}, {name: 'issuedAt', type: 'uint64'}, {name: 'deadline', type: 'uint64'}, {name: 'evidenceCommitment', type: 'bytes32'}, {name: 'policyId', type: 'bytes32'}]} as const;
  let nonce = 1n;
  const terms = async (p: {invoiceKey: Hex; supplierKey: Hex; recipient: Address; amountAtomic: bigint}) => {const now = (await client.getBlock()).timestamp; return {...p, token, authorizationNonce: nonce++, issuedAt: now - 1n, deadline: now + 300n, evidenceCommitment: keccak256(toHex(`evidence:${p.invoiceKey}`)), policyId};};
  const sign = (signer: {signTypedData: (args: any) => Promise<Hex>}, payment: any) => signer.signTypedData({domain, types, primaryType: 'Payment', message: payment});
  const simulatePay = async (payment: any, signature: Hex) => {try {await client.simulateContract({account: relayer, address: vault, abi: paymentGuardAbi, functionName: 'executePayment', args: [payment, signature]}); return 'WOULD_PAY';} catch (error) {return revertName(error);}};
  const simulateAuto = async (invoiceKey: Hex) => {try {await client.simulateContract({account: executor, address: automation, abi: autoArtifact.abi, functionName: 'executeRegistered', args: [invoiceKey, keccak256(toHex('attacker-evidence'))]}); return 'WOULD_PAY';} catch (error) {return revertName(error);}};

  // Controls: the setup can pay when authority is genuine.
  const legit = payables.find(p => p.scenarioId === 'BENIGN-06')!;
  const legitPayment = await terms({invoiceKey: legit.invoiceKey, supplierKey: legit.supplierKey, recipient: legit.recipient, amountAtomic: BigInt(legit.amountAtomic)});
  const legitSignature = await sign(approver, legitPayment);
  const supplierBefore = await balance(legit.recipient);
  const controlHuman = await mined(await wallet.writeContract({account: relayer, address: vault, abi: paymentGuardAbi, functionName: 'executePayment', args: [legitPayment, legitSignature]}));
  const controlAuto = await mined(await wallet.writeContract({account: executor, address: automation, abi: autoArtifact.abi, functionName: 'executeRegistered', args: [registered[0].invoiceKey, keccak256(toHex('control-evidence'))]}));
  const controls = {humanApprovedPayment: {status: controlHuman.status, tx: controlHuman.transactionHash, supplierReceivedAtomic: String(await balance(legit.recipient) - supplierBefore)}, automaticRegisteredPayment: {status: controlAuto.status, tx: controlAuto.transactionHash}};
  const vaultsBefore = {paymentGuard: await balance(vault), automationGuard: await balance(automation)};

  const rows: Row[] = readFileSync(resolve(out, 'items.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
  const escaped = rows.filter(r => r.malicious && r.outcome !== 'security_hold' && r.outcome !== 'error');
  const byReference = new Map(payables.map(p => [p.invoiceReference, p]));
  const fallback = payables.find(p => p.scenarioId === 'BENIGN-07')!;
  const attempts: Record<string, Record<string, number>> = {A1_forged_signature: {}, A2_replayed_signature: {}, A3_deceived_human_signs_attacker_terms: {}, A4_automation_executor: {}};
  const inflated: {id: string; result: string; claimed: string; registered: string}[] = [];
  const attackers = new Set<Address>();
  const count = (kind: string, result: string) => {attempts[kind]![result] = (attempts[kind]![result] ?? 0) + 1;};
  let autoSample: {invoiceKey: Hex; registeredRecipient: Address; attacker: Address} | undefined;
  const random = privateKeyToAccount(keccak256(toHex('attacker-signing-key')));
  // Baseline for comparison: a typical unguarded setup where the AI agent holds a funded wallet and
  // sends whatever it is told. Same attacks, same chain, same funding as the vault; transfers are real.
  const agentWallet = account(6);
  await mined(await wallet.writeContract({account: owner, address: token, abi: demoTokenAbi, functionName: 'transfer', args: [agentWallet.address, 300000000000n]}));
  const agentStart = await balance(agentWallet.address);
  const baseline = {attempts: 0, paidToAttacker: 0, failedInsufficientFunds: 0, sentToAttackersAtomic: 0n};
  const pending: {attacker: Address; amount: bigint}[] = [];
  for (const [i, r] of escaped.entries()) {
    const target = (r.payableReference && byReference.get(r.payableReference)) || fallback;
    const attacker = (r.attackerRecipient ?? `0x${keccak256(toHex(`attacker:${r.id}`)).slice(26)}`) as Address;
    attackers.add(attacker);
    const amount = r.claimedAmountAtomic ? BigInt(r.claimedAmountAtomic) : BigInt(target.amountAtomic);
    const attack = await terms({invoiceKey: target.invoiceKey, supplierKey: target.supplierKey, recipient: attacker, amountAtomic: amount});
    pending.push({attacker, amount});
    count('A1_forged_signature', await simulatePay(attack, await sign(i % 2 ? relayer : random, attack)));
    count('A2_replayed_signature', await simulatePay({...legitPayment, invoiceKey: target.invoiceKey, recipient: attacker, amountAtomic: amount}, legitSignature));
    count('A3_deceived_human_signs_attacker_terms', await simulatePay(attack, await sign(approver, attack)));
    // AutomationGuard pays only the owner-registered recipient and amount; a success here is the
    // legitimate obligation being paid on its registered terms, never a diversion to the attacker.
    const autoKey = r.payableReference ? target.invoiceKey : keccak256(toHex(`unknown:${r.id}`));
    const auto = await simulateAuto(autoKey);
    if (auto === 'WOULD_PAY') {
      const [, registeredRecipient] = await client.readContract({address: automation, abi: autoArtifact.abi, functionName: 'obligations', args: [autoKey]}) as [Hex, Address, bigint, Hex];
      count('A4_automation_executor', registeredRecipient.toLowerCase() === attacker.toLowerCase() ? 'WOULD_PAY' : 'PAYS_REGISTERED_SUPPLIER_ON_REGISTERED_TERMS');
      if (!autoSample) autoSample = {invoiceKey: autoKey, registeredRecipient, attacker};
    } else count('A4_automation_executor', auto);
    if (r.claimedAmountAtomic) {
      // Residual-risk probe: a deceived human signs the inflated amount to the REAL supplier.
      const over = await terms({invoiceKey: target.invoiceKey, supplierKey: target.supplierKey, recipient: target.recipient, amountAtomic: amount});
      inflated.push({id: r.id, result: await simulatePay(over, await sign(approver, over)), claimed: String(amount), registered: target.amountAtomic});
    }
  }

  // Broadcast one real transaction per attempt type so the reverts are recorded on chain, not only simulated.
  const sample = escaped.find(r => r.attackerRecipient) ?? escaped[0]!;
  const sampleTarget = (sample.payableReference && byReference.get(sample.payableReference)) || fallback;
  const onChain: Record<string, {status: string; tx: Hex}> = {};
  const sampleAttack = await terms({invoiceKey: sampleTarget.invoiceKey, supplierKey: sampleTarget.supplierKey, recipient: (sample.attackerRecipient ?? relayer.address) as Address, amountAtomic: BigInt(sampleTarget.amountAtomic)});
  const broadcasts: [string, () => Promise<Hex>][] = [
    ['A1_forged_signature', async () => wallet.writeContract({account: relayer, address: vault, abi: paymentGuardAbi, functionName: 'executePayment', args: [sampleAttack, await sign(relayer, sampleAttack)], gas: 500000n})],
    ['A2_replayed_signature', async () => wallet.writeContract({account: relayer, address: vault, abi: paymentGuardAbi, functionName: 'executePayment', args: [{...legitPayment, recipient: sampleAttack.recipient}, legitSignature], gas: 500000n})],
    ['A3_deceived_human_signs_attacker_terms', async () => wallet.writeContract({account: relayer, address: vault, abi: paymentGuardAbi, functionName: 'executePayment', args: [sampleAttack, await sign(approver, sampleAttack)], gas: 500000n})],
    ['A4_automation_executor', async () => wallet.writeContract({account: executor, address: automation, abi: autoArtifact.abi, functionName: 'executeRegistered', args: [keccak256(toHex('unregistered')), keccak256(toHex('x'))], gas: 500000n})],
  ];
  for (const [name, send] of broadcasts) {const receipt = await mined(await send()); onChain[name] = {status: receipt.status, tx: receipt.transactionHash};}
  let automationProbe: unknown = 'no escaped attack referenced a registered obligation';
  if (autoSample) {
    // Execute one such call for real and record who was paid.
    const [supplierBefore, attackerBefore] = [await balance(autoSample.registeredRecipient), await balance(autoSample.attacker)];
    const receipt = await mined(await wallet.writeContract({account: executor, address: automation, abi: autoArtifact.abi, functionName: 'executeRegistered', args: [autoSample.invoiceKey, keccak256(toHex('attacker-evidence'))]}));
    automationProbe = {status: receipt.status, tx: receipt.transactionHash, registeredSupplierReceivedAtomic: String(await balance(autoSample.registeredRecipient) - supplierBefore), attackerReceivedAtomic: String(await balance(autoSample.attacker) - attackerBefore)};
  }

  const attackerBalances = await Promise.all([...attackers].map(balance));
  const fraudulent = Object.values(attempts).reduce((sum, results) => sum + (results.WOULD_PAY ?? 0), 0);
  const vaultsAfter = {paymentGuard: await balance(vault), automationGuard: await balance(automation)};
  for (const {attacker, amount} of pending) {
    baseline.attempts++;
    try {const receipt = await mined(await wallet.writeContract({account: agentWallet, address: token, abi: demoTokenAbi, functionName: 'transfer', args: [attacker, amount]})); if (receipt.status === 'success') {baseline.paidToAttacker++; baseline.sentToAttackersAtomic += amount;}}
    catch {baseline.failedInsufficientFunds++;}
  }
  const unguardedBaseline = {setup: 'AI agent holding a funded wallet (300,000 DEMO, same as the vault) that executes the payment each attack requests; no guardrails, real transfers on the same chain', attempts: baseline.attempts, paidToAttacker: baseline.paidToAttacker, failedOnlyBecauseWalletWasEmpty: baseline.failedInsufficientFunds, sentToAttackersAtomic: String(baseline.sentToAttackersAtomic), walletStartAtomic: String(agentStart), walletEndAtomic: String(await balance(agentWallet.address))};
  const report = {
    unguardedBaseline,
    schemaVersion: 'secure-finance.chain-escape.v1', generatedAt: new Date().toISOString(),
    threatModel: 'Attack evaded detection; attacker controls agents, API server, relayer key and automation executor key; attacker does not hold the approver wallet key. A3 also assumes the approver was deceived into signing the attacker terms.',
    chain: {network: 'isolated local Anvil (chain 31337, cancun)', paymentGuard: vault, automationGuard: automation, token},
    controls,
    escapedAttacks: escaped.length, escapedBySource: escaped.reduce((a, r) => ({...a, [r.source]: (a[r.source] ?? 0) + 1}), {} as Record<string, number>),
    attempts, totalAttempts: escaped.length * 4, paymentsToAttackerThatWouldSucceed: fraudulent,
    onChainBroadcasts: onChain, automationProbe,
    balances: {attackerAddresses: attackers.size, attackerTotalReceivedAtomic: String(attackerBalances.reduce((a, b) => a + b, 0n)), paymentGuardUnchangedByAttacks: vaultsAfter.paymentGuard === vaultsBefore.paymentGuard, automationGuardChangeAtomic: String(vaultsAfter.automationGuard - vaultsBefore.automationGuard)},
    residualRisk: {
      description: 'If a deceived approver signs an INFLATED amount to the real registered supplier, the contract only enforces the per-payment cap. The application amount check (trusted payable record) is the control for this case; funds would go to the legitimate supplier, not the attacker.',
      probes: inflated.length, wouldPay: inflated.filter(x => x.result === 'WOULD_PAY').length, blockedByCap: inflated.filter(x => x.result === 'InvalidAmount').length,
    },
  };
  writeFileSync(resolve(out, 'chain-escape.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  anvil?.kill('SIGTERM');
}
