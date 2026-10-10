import {describe,it,expect} from 'vitest';
import {parseAmount,formatAmount,uint256Schema,uint64Schema,paymentSchema,validateSourceSpan} from '@secure-finance/shared';
describe('exact canonical financial values',()=>{
 it('round trips beyond JS safe integer without Number',()=>{const input='9007199254740993.123456';const atomic=parseAmount(input);expect(atomic).toBe('9007199254740993123456');expect(formatAmount(atomic).replaceAll(',','')).toBe(input);});
 it.each(['01','1e6','-1','1.0000001','1,000',' 1','.1','NaN','Infinity'])('rejects invalid decimal %s',input=>expect(()=>parseAmount(input)).toThrow());
 it('enforces uint ranges',()=>{expect(uint256Schema.parse((2n**256n-1n).toString())).toBe((2n**256n-1n).toString());expect(()=>uint256Schema.parse((2n**256n).toString())).toThrow();expect(()=>uint64Schema.parse((2n**64n).toString())).toThrow();});
 it('validates UTF-16 source pointers exactly',()=>{const page='A😀 CFO approved';expect(validateSourceSpan({page:1,start:4,end:16,quote:'CFO approved'},[page])).toBe(true);expect(validateSourceSpan({page:1,start:3,end:16,quote:'CFO approved'},[page])).toBe(false);});
});
