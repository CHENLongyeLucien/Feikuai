import { readFile, writeFile } from 'node:fs/promises';
const guard = JSON.parse(await readFile('contracts/out/PaymentGuard.sol/PaymentGuard.json','utf8'));
const token = JSON.parse(await readFile('contracts/out/DemoToken.sol/DemoToken.json','utf8'));
await writeFile('packages/chain/src/abi.ts', '// Generated from Foundry build artifacts. Run pnpm contracts:export-abi.\nexport const paymentGuardAbi = '+JSON.stringify(guard.abi,null,2)+' as const;\nexport const demoTokenAbi = '+JSON.stringify(token.abi,null,2)+' as const;\n');
console.log('Exported PaymentGuard and DEMO ABI from actual compiled artifacts.');
