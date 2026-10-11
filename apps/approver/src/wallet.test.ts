import {describe,expect,it} from 'vitest';
import {walletErrorText} from './wallet';

describe('wallet error messages',()=>{
 it('explains a rejected wallet request without implying anything was signed',()=>{
  expect(walletErrorText(Object.assign(new Error('User rejected the request.'),{code:4001}))).toMatch(/declined.*Nothing was signed/);
  expect(walletErrorText(new Error('MetaMask Tx Signature: User denied transaction signature.'))).toMatch(/declined/);
  expect(walletErrorText({cause:{code:4001}})).toMatch(/declined/);
 });
 it('explains pending, locked and missing-network states',()=>{
  expect(walletErrorText({code:-32002})).toMatch(/already has a request waiting/);
  expect(walletErrorText({code:4100})).toMatch(/Unlock your wallet/);
  expect(walletErrorText({code:4902})).toMatch(/not added/);
 });
 it('keeps other provider messages',()=>{expect(walletErrorText(new Error('Network timeout'))).toBe('Network timeout');});
});
