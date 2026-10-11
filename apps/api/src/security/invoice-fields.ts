import type {PageText} from './artifacts.js';

/** Explicit labels only. Values remain verbatim source quotes, never registry guesses. */
export function invoiceFieldCandidates(pages:PageText[]){
 const patterns={
  invoiceReference:/(?:\bInvoice(?:\s+(?:reference|number|no\.?))?|\bFacture(?:\s+(?:r[eé]f[eé]rence|num[eé]ro|n[°ºo.]?))?|\bR[eé]f[eé]rence\s+(?:de\s+(?:la\s+)?)?facture)\s*[:：#-]?\s*((?=[A-Za-z0-9._/-]*[0-9])[A-Za-z0-9][A-Za-z0-9._/-]{1,79})/giu,
  supplierReference:/(?:\bSupplier\s+(?:reference|key|id)|\bFournisseur\s*(?:r[eé]f[eé]rence|identifiant)?|\b(?:R[eé]f[eé]rence|Identifiant)\s+(?:du\s+)?fournisseur)\s*[:：#-]?\s*(0x[0-9a-fA-F]{64})(?![0-9a-fA-F])/giu,
  amountDecimalCandidate:/(?:\bAmount(?:\s+due)?|\bTotal(?:\s+(?:due|TTC|amount))?|\bMontant(?:\s+(?:total|d[uû]))?|\bNet\s+[aà]\s+payer)\s*[:：]?\s*(?:[A-Z]{2,8}\s+)?([-+]?[0-9]+(?:[.,][0-9]+)*(?:[ \u00a0\u202f][0-9]{3})*(?:[.,][0-9]+)?)(?![0-9])/giu,
  displayedAsset:/(?:\bAmount(?:\s+due)?|\bTotal(?:\s+(?:due|TTC|amount))?|\bMontant(?:\s+(?:total|d[uû]))?|\bNet\s+[aà]\s+payer)\s*[:：]?\s*[-+]?[0-9]+(?:[.,][0-9]+)*(?:[ \u00a0\u202f][0-9]{3})*(?:[.,][0-9]+)?\s+([A-Z]{2,8})(?![A-Za-z])/gu,
  claimedRecipient:/(?:\bRecipient|\bDestinataire|\bAdresse\s+(?:du\s+)?(?:portefeuille|b[eé]n[eé]ficiaire))\s*[:：]?\s*(0x[0-9a-fA-F]{40})(?![0-9a-fA-F])/giu,
 };
 type Field=keyof typeof patterns;
 const output={} as Record<Field,Array<{value:string;span:{page:number;start:number;end:number;quote:string}}>>;
 for(const field of Object.keys(patterns) as Field[]){output[field]=[];for(const p of pages){for(const m of p.text.matchAll(patterns[field])){const value=m[1]!;const start=m.index+m[0].lastIndexOf(value);output[field].push({value,span:{page:p.page,start,end:start+value.length,quote:value}});}}}
 // Currency-before-amount is explicit too. No unsupported asset is inferred as DEMO.
 for(const p of pages)for(const m of p.text.matchAll(/(?:\bAmount(?:\s+due)?|\bTotal(?:\s+(?:due|TTC|amount))?|\bMontant(?:\s+(?:total|d[uû]))?)\s*[:：]?\s*([A-Z]{2,8})\s+[-+]?[0-9]/gu)){const value=m[1]!,start=m.index+m[0].indexOf(value);output.displayedAsset.push({value,span:{page:p.page,start,end:start+value.length,quote:value}});}
 return output;
}

export function invoiceReferences(text:string){return [...new Set(invoiceFieldCandidates([{page:1,text}]).invoiceReference.map(value=>value.value))];}
