import {extract} from '../security/artifacts.js';
import {fail} from '../domain/errors.js';

type EmailExtraction={text:string;algorithm:string;issues:string[]};
/** Bounded MIME decoding only. No HTML rendering, URL fetching or attachment execution. */
export async function extractEmail(bytes:Uint8Array):Promise<EmailExtraction>{
 if(bytes.length>10*1024*1024)fail('UPLOAD_TOO_LARGE','Email exceeds 10 MiB.',413);
 const issues:string[]=[],texts:string[]=[];let parts=0,totalCharacters=0;
 const add=(value:string)=>{totalCharacters+=value.length;if(totalCharacters>40000)fail('EXTRACTED_INPUT_TOO_LARGE','Complete decoded email exceeds 40,000 characters; no content was silently truncated.');if(value.trim())texts.push(value);};
 const decode=(value:Uint8Array,charset='utf-8')=>{try{return new TextDecoder(charset,{fatal:true}).decode(value);}catch{throw new Error(`Unsupported or invalid email text charset: ${charset.slice(0,60)}`);}};
 const transfer=(value:Buffer,encoding:string)=>{
  if(encoding==='base64'){const raw=value.toString('ascii').replace(/[\r\n\t ]/g,'');if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(raw))throw new Error('Malformed base64 MIME part.');return Buffer.from(raw,'base64');}
  if(encoding==='quoted-printable'){const raw=value.toString('latin1').replace(/=\r?\n/g,'');if(/=(?![0-9A-Fa-f]{2})/.test(raw))throw new Error('Malformed quoted-printable MIME part.');return Buffer.from(raw.replace(/=([0-9a-f]{2})/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16))),'latin1');}
  if(encoding&&!['7bit','8bit','binary'].includes(encoding))throw new Error('Unsupported MIME content-transfer encoding.');return value;
 };
 const words=(value:string)=>value.replace(/=\?([^?\s]+)\?([bq])\?([^?]*)\?=/gi,(_,charset,encoding,encoded)=>decode(transfer(Buffer.from(encoding.toLowerCase()==='q'?encoded.replace(/_/g,' '):encoded,'ascii'),encoding.toLowerCase()==='q'?'quoted-printable':'base64'),charset));
 const entities=(value:string)=>value.replace(/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos|nbsp);/gi,(all,entity:string)=>{if(entity[0]==='#'){const n=parseInt(entity[1]?.toLowerCase()==='x'?entity.slice(2):entity.slice(1),entity[1]?.toLowerCase()==='x'?16:10);return n>0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):'[invalid character reference]';}return ({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '} as Record<string,string>)[entity.toLowerCase()]??all;});
 const htmlText=(html:string)=>{
  const urls=[...html.matchAll(/\b(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)].map(m=>entities(m[1]??m[2]??m[3]??''));
  const active=/<(?:script|iframe|object|embed)\b|\bon\w+\s*=|javascript:/i.test(html);
  return `${active?'<script> Active HTML content was present; it was not executed.\n':''}${entities(html.replace(/<[^>]*>/g,'\n'))}${urls.length?'\nUnverified HTML destinations:\n'+urls.join('\n'):''}`;
 };
 const parameter=(value:string,key:string)=>{const match=new RegExp(`(?:^|;)\\s*${key}\\s*=\\s*(?:"([^"\\r\\n]*)"|([^;\\s]*))`,'i').exec(value);return match?.[1]??match?.[2]??null;};
 async function visit(raw:Buffer,depth:number){
  if(++parts>32||depth>6)fail('EMAIL_COMPLEXITY_LIMIT','Email exceeds 32 MIME parts or six nesting levels.');
  const data=raw.toString('latin1'),split=/\r?\n\r?\n/.exec(data);
  if(!split){if(depth===0){add(decode(raw));return;}throw new Error('MIME part has no header/body separator.');}
  if(split.index>16384)fail('EMAIL_HEADER_LIMIT','Email headers exceed 16 KiB.');
  const headers=new Map<string,string[]>();
  for(const line of data.slice(0,split.index).replace(/\r?\n[ \t]+/g,' ').split(/\r?\n/)){const colon=line.indexOf(':');if(colon<1)throw new Error('Malformed email header.');const name=line.slice(0,colon).toLowerCase(),values=headers.get(name)??[];values.push(line.slice(colon+1).trim());headers.set(name,values);}
  for(const key of ['content-type','content-transfer-encoding','content-disposition'])if((headers.get(key)?.length??0)>1)throw new Error('Ambiguous duplicate MIME headers.');
  if(depth===0)for(const key of ['from','sender','reply-to','subject'])for(const value of headers.get(key)??[])add(`${key}: ${words(decode(Buffer.from(value,'latin1')))}`);
  const contentType=headers.get('content-type')?.[0]??'text/plain; charset=utf-8',mime=contentType.split(';')[0]!.trim().toLowerCase();
  const body=raw.subarray(split.index+split[0].length);
  if(mime.startsWith('multipart/')){
   const boundary=parameter(contentType,'boundary');if(!boundary||boundary.length>200)throw new Error('Multipart email is missing a bounded boundary.');
   const lines=body.toString('latin1').split(/\r?\n/);let inside=false,closed=false,chunk:string[]=[];
   for(const line of lines){if(line===`--${boundary}`||line===`--${boundary}--`){if(inside)await visit(Buffer.from(chunk.join('\r\n'),'latin1'),depth+1);chunk=[];if(line===`--${boundary}--`){closed=true;inside=false;break;}inside=true;}else if(inside)chunk.push(line);}
   if(!closed)throw new Error('Multipart email ended before its closing boundary.');return;
  }
  const decoded=transfer(body,(headers.get('content-transfer-encoding')?.[0]??'').toLowerCase());
  if(mime==='text/plain'){add(decode(decoded,parameter(contentType,'charset')??'utf-8'));return;}
  if(mime==='text/html'){add(htmlText(decode(decoded,parameter(contentType,'charset')??'utf-8')));return;}
  if(mime==='application/pdf'){const result=await extract(decoded,mime);for(const page of result.pages)add(page.text);return;}
  if(mime==='message/rfc822'){await visit(decoded,depth+1);return;}
  // Retain the original source, but never silently treat an uninspected attachment as safe.
  issues.push(`Email contains an uninspected ${mime.slice(0,100)} part. Supply its relevant content in a supported text or PDF source.`);
 }
 try{await visit(Buffer.from(bytes),0);}catch(error){if((error as any)?.code)throw error;issues.push(error instanceof Error?error.message:'Email MIME extraction did not complete.');}
 if(!texts.length&&!issues.length)issues.push('The email contains no readable message text.');
 return {text:texts.join('\n\n'),algorithm:'rfc822-bounded-mime-v2',issues:[...new Set(issues)]};
}
