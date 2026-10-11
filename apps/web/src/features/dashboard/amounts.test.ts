import {describe,expect,it} from 'vitest';
import {chartRatio,dashboardAmount,maximumAtomic} from './amounts';
describe('exact dashboard money and bounded chart coordinates',()=>{
 it('preserves fractional atomic units beyond the Number safe-integer boundary',()=>{
  expect(dashboardAmount('9007199254740993123456',6)).toBe('9,007,199,254,740,993.123456');
  expect(dashboardAmount('10000001',6)).toBe('10.000001');expect(dashboardAmount('0',6)).toBe('0');
 });
 it('formats multi-obligation aggregates larger than one uint256',()=>{
  const aggregate=((2n**256n-1n)*3n).toString();expect(dashboardAmount(aggregate,0).replaceAll(',','')).toBe(aggregate);
 });
 it('derives chart ratios and maxima without converting atomic amounts to floating point',()=>{
  const max=(10n**80n).toString(),half=(5n*10n**79n).toString();expect(chartRatio(half,max)).toBe(.5);expect(chartRatio(max,max)).toBe(1);expect(chartRatio('0',max)).toBe(0);expect(chartRatio('1','0')).toBe(0);expect(chartRatio('20','10')).toBe(1);expect(maximumAtomic([half,max,'9'])).toBe(max);
 });
});
