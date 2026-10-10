import {describe,it,expect} from 'vitest';
import {hashTypedData,keccak256,toHex} from 'viem';
import {readFileSync} from 'node:fs';
import {derivePolicy,paymentTypedData,deploymentSchema,PAYMENT_TYPEHASH} from './index.js';
import {paymentSchema,domainSchema} from '@secure-finance/shared';
describe('shared chain encoding',()=>{
  it('matches a golden digest measured from the actual Solidity deployment',()=>{
    const fixture=JSON.parse(readFileSync('fixtures/chain-golden.local.json','utf8'));
    expect(hashTypedData(paymentTypedData(domainSchema.parse(fixture.domain),paymentSchema.parse(fixture.payment)))) .toBe(fixture.typedDigest);
    const deployment=deploymentSchema.parse(JSON.parse(readFileSync('deployments/local.json','utf8')));
    expect(derivePolicy(deployment)).toEqual(fixture.policy);
  });
  it('binds every signed field and chain / vault',()=>{
    const fixture=JSON.parse(readFileSync('fixtures/chain-golden.local.json','utf8'));const p=paymentSchema.parse(fixture.payment),d=domainSchema.parse(fixture.domain);
    for(const field of Object.keys(p) as Array<keyof typeof p>){const mutation:Record<string,unknown>={...p};if(['amountAtomic','authorizationNonce','issuedAt','deadline'].includes(field))mutation[field]=(BigInt(p[field])+1n).toString();else mutation[field]=field==='token'||field==='recipient'?'0x0000000000000000000000000000000000000001':keccak256(toHex('mutated'));expect(hashTypedData(paymentTypedData(d,paymentSchema.parse(mutation)))).not.toBe(fixture.typedDigest);}
    expect(hashTypedData(paymentTypedData({...d,chainId:'43113'},p))).not.toBe(fixture.typedDigest);
    expect(hashTypedData(paymentTypedData({...d,verifyingContract:'0x0000000000000000000000000000000000000001'},p))).not.toBe(fixture.typedDigest);
    expect(PAYMENT_TYPEHASH).toBe(fixture.policy.paymentTypeHash);
  });
});
