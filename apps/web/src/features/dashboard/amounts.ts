/** Totals may exceed one uint256 across many obligations. Never round them through Number. */
export function dashboardAmount(value:string,decimals:number){
 if(!/^(0|[1-9][0-9]*)$/.test(value)||!Number.isSafeInteger(decimals)||decimals<0||decimals>77)throw new Error('Invalid dashboard amount');
 const amount=BigInt(value),scale=10n**BigInt(decimals);
 const whole=(amount/scale).toString().replace(/\B(?=(\d{3})+(?!\d))/g,',');
 const fraction=(amount%scale).toString().padStart(decimals,'0').replace(/0+$/,'');
 return fraction?`${whole}.${fraction}`:whole;
}
/** Only a bounded 0–1 visual ratio becomes a Number; source money stays exact. */
export function chartRatio(value:string,maximum:string){
 const v=BigInt(value),max=BigInt(maximum);if(v<=0n||max<=0n)return 0;
 return Number((v>max?max:v)*10000n/max)/10000;
}
export function maximumAtomic(values:string[]){return values.reduce((max,value)=>BigInt(value)>BigInt(max)?value:max,'0');}
