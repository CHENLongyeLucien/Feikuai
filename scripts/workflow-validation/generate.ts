import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import PDFDocument from 'pdfkit';
import {samples} from './corpus.js';
import {samplesV2,type SampleV2} from './corpus-v2.js';

const suite=process.argv.includes('--suite')?process.argv[process.argv.indexOf('--suite')+1]:'v1';
if(suite!=='v1'&&suite!=='v2')throw new Error('Use --suite v1 or --suite v2.');
const root=resolve(suite==='v2'?'fixtures/workflow-validation-v2':'fixtures/workflow-validation');
const corpus:SampleV2[]=suite==='v2'?samplesV2:samples;
async function email(sample:SampleV2):Promise<string>{
 if(sample.rawEmail)return sample.rawEmail;
 if(sample.attachment){
  const boundary=`QA-${sample.id}-mixed`,headers=[`From: QA Contact <qa-${sample.id.toLowerCase()}@example.invalid>`,'To: Inbox <inbox@example.invalid>',`Subject: ${sample.subject??`Validation ${sample.id}`}`,'Date: Mon, 12 Oct 2026 09:00:00 +0000',`Message-ID: <${sample.id.toLowerCase()}@example.invalid>`,'MIME-Version: 1.0'];
  const bytes=sample.attachment.invoiceBody?await pdf({...sample,body:sample.attachment.invoiceBody}):Buffer.from(sample.attachment.bytes??'','base64');
  return headers.concat(`Content-Type: multipart/mixed; boundary="${boundary}"`,'',`--${boundary}`,'Content-Type: text/plain; charset=utf-8','',sample.body,`--${boundary}`,`Content-Type: ${sample.attachment.mime}; name="${sample.attachment.filename}"`,`Content-Disposition: attachment; filename="${sample.attachment.filename}"`,'Content-Transfer-Encoding: base64','',bytes.toString('base64').match(/.{1,76}/g)!.join('\r\n'),`--${boundary}--`,'').join('\r\n');
 }
 return plainEmail(sample);
}
function plainEmail(sample:SampleV2){
 const headers=[`From: QA Contact <qa-${sample.id.toLowerCase()}@example.invalid>`,'To: Inbox <inbox@example.invalid>',`Subject: ${sample.subject??`Validation ${sample.id}`}`,'Date: Sun, 11 Oct 2026 12:00:00 +0000',`Message-ID: <${sample.id.toLowerCase()}@example.invalid>`,'MIME-Version: 1.0'];
 if(sample.encoding==='multipart'){
  const boundary=`QA-${sample.id}-alternative`;
  return headers.concat(`Content-Type: multipart/alternative; boundary="${boundary}"`,'',`--${boundary}`,'Content-Type: text/plain; charset=utf-8','',sample.body,`--${boundary}`,'Content-Type: text/html; charset=utf-8','',`<html><body><p>${sample.body}</p></body></html>`,`--${boundary}--`,'').join('\r\n');
 }
 const content=sample.encoding==='base64'?Buffer.from(sample.body).toString('base64').match(/.{1,76}/g)!.join('\r\n'):sample.encoding==='quoted-printable'?Array.from(Buffer.from(sample.body),byte=>'='+byte.toString(16).padStart(2,'0').toUpperCase()).join('').match(/.{1,72}/g)!.join('=\r\n'):sample.body;
 return headers.concat(`Content-Type: ${sample.encoding==='html'?'text/html':'text/plain'}; charset=utf-8`,`Content-Transfer-Encoding: ${sample.encoding==='base64'?'base64':sample.encoding==='quoted-printable'?'quoted-printable':'8bit'}`,'',content,'').join('\r\n');
}
async function pdf(sample:SampleV2):Promise<Buffer>{
 const doc=new PDFDocument({size:'A4',margin:54,info:{Title:`Workflow validation ${sample.id}`,Author:'SecureFinance synthetic QA',CreationDate:new Date('2026-10-11T12:00:00Z'),ModDate:new Date('2026-10-11T12:00:00Z')}}),chunks:Buffer[]=[];
 const ready=new Promise<Buffer>((resolve,reject)=>{doc.on('data',chunk=>chunks.push(chunk));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
 if(!sample.blankPdf){doc.fillColor('#244c3d').font('Helvetica-Bold').fontSize(20).text('Invoice test document');
 doc.moveDown(.4).fillColor('#67786d').font('Helvetica').fontSize(10).text(`Case ${sample.id} | Synthetic validation input | 11 October 2026`);}
 doc.moveTo(54,115).lineTo(541,115).strokeColor('#d2ddd6').stroke();doc.y=140;
 // An image-only page has no selectable text, like a scan.
 if(sample.blankPdf)doc.rect(54,140,487,300).fill('#cfd8d3');else doc.fillColor('#21382e').font('Helvetica').fontSize(10).text(sample.body.replaceAll('\r\n','\n'),{width:487,lineGap:7});
 if(!sample.blankPdf)doc.fontSize(9).fillColor('#67786d').text('For isolated testing only. No real customer information or funds.',54,760,{width:487});doc.end();return ready;
}
await mkdir(root,{recursive:true});
const manifest=[];
for(const sample of corpus){
 const path=resolve(root,sample.file);await mkdir(dirname(path),{recursive:true});
 const bytes=sample.channel==='invoice'?await pdf(sample):Buffer.from(sample.channel==='email'?await email(sample):sample.body+'\n');
 await writeFile(path,bytes);const {body:_,rawEmail:_raw,attachment:_attachment,...entry}=sample;manifest.push({...entry,sha256:createHash('sha256').update(bytes).digest('hex')});
}
if(suite==='v2'){
 await writeFile(resolve(root,'manifest.json'),JSON.stringify({schemaVersion:'workflow-validation.v2',scope:'Second set of 100 authored synthetic inputs aligned with the eight-stage Feikuai workflow. Deterministic fixture-agent execution; no live model, malware browser, audio transcription, chain transaction or settlement coverage.',samples:manifest},null,2)+'\n');
 const rows=samplesV2.map(s=>`| ${s.id} | [${s.name}](${s.file}) | ${s.expected.classification??"(not asserted)"} | ${s.expected.httpStatus?`rejected at intake (${s.expected.errorCode})`:s.expected.status} | ${s.expected.reason} |`).join('\n');
 await writeFile(resolve(root,'README.md'),`# Workflow validation corpus v2 (100 inputs)\n\n30 invoice PDFs, 25 emails (.eml), 20 voice transcripts and 25 text messages, all synthetic. Every expected outcome was written from the Feikuai reset brief before the run. All URLs are inert test hosts and nothing is fetched.\n\nCoverage by workflow stage: intake failures (image-only PDF, malformed MIME, unknown charset, archive attachment); security findings (prompt injection, homoglyphs, invisible characters, claimed approvals, secrecy, destination changes, phishing, vishing, executable content); finance discrepancies (amount, asset, one-character recipient changes, supplier key, conflicting facts); duplicates and already-paid invoices; and legitimate controls that should clear.\n\nRun: \`pnpm test:workflow:v2\`. Regenerate: \`pnpm fixtures:workflow:v2\`. Results are written to var/workflow-validation-v2/.\n\nApproved means workflow clearance only. A separate human wallet signature is still required for any payment.\n\n| ID | Input | Expected classification | Expected outcome | Reason |\n| --- | --- | --- | --- | --- |\n${rows}\n`);
 console.log('Generated 100 synthetic v2 inputs: 30 PDF, 25 EML, 45 TXT.');
}else{
await writeFile(resolve(root,'manifest.json'),JSON.stringify({schemaVersion:'workflow-validation.v1',scope:'100 authored synthetic inputs. Deterministic fixture-agent execution; no live model, malware browser, audio transcription, chain transaction or settlement coverage.',samples:manifest},null,2)+'\n');
const rows=samples.map(s=>`| ${s.id} | [${s.name}](${s.file}) | ${s.expected.classification} | ${s.expected.status} | ${s.expected.reason} |`).join('\n');
await writeFile(resolve(root,'README.md'),`# 100-input workflow validation corpus\n\nExactly 25 Invoice PDFs, 25 Email .eml files, 25 Voice transcripts, and 25 Text messages. Every file has distinct source content and an authored expected result. These are synthetic inputs; all URL hosts use the reserved example.invalid domain. Attack examples are inert source text, not active PDF payloads.\n\nRun from the project root:\n\n\`\`\`sh\npnpm test:workflow\n# Or: npm run test:workflow\n\`\`\`\n\nThe runner authenticates a synthetic test member and submits all 100 files/transcripts through the actual intake API. It creates a temporary SQLite database, trusted payable records, deployment manifest and artifact directory; runs both durable inbox and payment-analysis workers; reads outcomes back through the API; and then removes its temporary state. Nothing is submitted to an existing service, live model or blockchain. It writes a results report under ignored var/workflow-validation/.\n\nApproved means workflow clearance only. Every registered payable here is 10 DEMO and still requires separate wallet authorization. The runner verifies zero authorizations, execution requests, settlements and automatic-payment records. Voice files are manual transcripts; this does not measure speech transcription or speaker authenticity. Email sender identity and links remain unverified.\n\nThe fixture registry is created only inside the isolated runner. Uploading these samples into a normal workspace without matching trusted records correctly produces invoice review holds. Use the ordinary Invoice/Email/Voice/Text buttons to inspect messages manually; do not copy the test registry into a funded environment.\n\nThe test driver uses reserved documentation IP addresses in groups of ten to exercise 100 authenticated inputs without changing the production intake rate limit. It does not benchmark rate limiting. Waiting-job clocks are advanced in the temporary database; no production scheduling state changes.\n\nRegenerate reproducibly with \`pnpm fixtures:workflow\` (or \`npm run fixtures:workflow\`). The same 100 scenarios and one global safety assertion also run in \`tests/api/workflow-validation.test.ts\`. See [recorded validation results](../../docs/workflow-validation/README.md). The JSON manifest is for the automated test driver; users can use this index and the PDF/EML/TXT inputs directly. Expectations are authored in the corpus, never copied from observed implementation output.\n\n| ID | Input | Expected classification | Expected outcome | Reason |\n| --- | --- | --- | --- | --- |\n${rows}\n`);
console.log('Generated 100 synthetic inputs: 25 PDF, 25 EML, 50 TXT.');
}
