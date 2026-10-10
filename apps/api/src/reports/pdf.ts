import PDFDocument from 'pdfkit';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {formatAmount} from '@secure-finance/shared';
import type {InboxDTO} from '../inbox/types.js';

type Tone='neutral'|'good'|'attention';
type Entry={label:string;value:string;detail?:string;tone?:Tone};
type Section={title:string;description?:string;entries:Entry[]};
export type ReadingReport={kind:'Invoice review'|'Inbox review';title:string;subtitle:string;generatedAt:string;version:string;status:string;sections:Section[]};
const readable=(value:unknown)=>String(value??'Not recorded').replace(/([a-z])([A-Z])/g,'$1 $2').replace(/[_-]/g,' ').toLowerCase().replace(/^./,letter=>letter.toUpperCase());
const when=(value:unknown)=>{if(!value)return 'Not recorded';const date=new Date(String(value));return Number.isNaN(date.valueOf())?'Date could not be read':date.toISOString().replace('T',' ').replace(/\.\d{3}Z$/,' UTC');};
const mode=(value:unknown)=>value==='live'?'Live model run':value==='fixture'?'Scripted demonstration fixture':value==='live_agents'?'Live model outputs with independent checks':value==='fixture_agents'?'Demonstration agent fixtures with independent checks':value==='deterministic_rules'?'Independent deterministic rules':'Review method not recorded';
const none=(label:string):Entry[]=>[{label,value:'No entries recorded.'}];
const rows=(entries:Entry[],label:string)=>entries.length?entries:none(label);
const statusText:Record<string,string>={SETTLED:'Payment verified in the recorded ledger',UNSETTLED:'No verified payment is recorded',CONFIRMED:'Executed receipt verified',NONE:'No execution requested',UNKNOWN:'Outcome uncertain; reconciliation needed',INCONSISTENT:'Evidence needs investigation',REVERTED:'Transaction failed onchain',HELD:'Stopped for review',PREPARING:'Preparing a transaction',PREPARED:'Prepared; payment not yet confirmed',SUBMITTED:'Submitted; payment not yet confirmed',PENDING:'Waiting for a confirmed outcome',VALID:'Wallet signature verified',AWAITING_SIGNATURE:'Waiting for an eligible wallet signature',REGISTERED_POLICY:'Exact standing payment policy',CONSUMED:'Authorization already used',CANCELLED:'Authorization cancelled',CANCELLATION_PENDING:'Cancellation awaiting confirmation',EXPIRED:'Authorization expired',READY_FOR_REVIEW:'Checks complete; review required',NEEDS_INFORMATION:'More information needed',RECEIVED:'Source received',EXTRACTING:'Intake analysis in progress',CHECKING:'Finance checks in progress',CLOSED:'Review closed'};
const humanStatus=(status:unknown)=>statusText[String(status)]??readable(status);
const monetary=(value:unknown)=>{try{return `${formatAmount(String(value))} DEMO`;}catch{return 'Amount not recorded';}};
const chainNotice='This PDF is a human-readable summary of application records at export time. It does not verify cryptographic evidence, grant payment authority, or provide a fresh network check. Only a separately verified executed receipt establishes a payment.';

/** Remove technical identifiers and active-looking destinations from the everyday reading copy. */
export function readingText(value:unknown):string{return String(value??'Not recorded').normalize('NFC').replace(/\b(?:0x[0-9a-f]{40,}|[0-9a-f]{64,})\b/gi,'[technical identifier omitted]').replace(/\b(?:https?:\/\/|javascript:|data:|file:\/\/|mailto:)[^\s<>"']+/gi,'[link omitted; not opened]').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/gu,char=>`[U+${char.codePointAt(0)!.toString(16).toUpperCase().padStart(4,'0')}]`).replace(/[\u2010-\u2015\u2212]/g,'-');}

export type CaseReportMetadata={createdAt?:string;updatedAt?:string;approvalDocumentVersion?:string|null;checkRun?:{createdAt:string;versions:{document:string;payable:string;supplier:string};checks:any[]}|null;currentVersions?:{document:string;payable:string;supplier:string}};
export function caseReadingReport(c:any,dates:CaseReportMetadata={}):ReadingReport{
 const automatic=c.paymentRoute==='REGISTERED_POLICY',payment=c.automationPayment??c,settled=payment.settlementStatus==='SETTLED';
 const runs=Array.isArray(c.analysis?.runs)?c.analysis.runs:[],checks=dates.checkRun?.checks??(Array.isArray(c.checks)?c.checks:[]);
 const checksCurrent=!!dates.checkRun&&!!dates.currentVersions&&(['document','payable','supplier'] as const).every(key=>String(dates.checkRun!.versions[key])===String(dates.currentVersions![key]));
 const flagged=c.analysis?.intake?.suspiciousInstructions??[],discrepancies=c.analysis?.finance?.discrepancies??[];
 const sections:Section[]=[
  {title:'At a glance',entries:[{label:'Supplier',value:c.supplierName??'Not recorded'},{label:'Invoice reference',value:c.invoiceReference??'Not recorded'},{label:'Invoice amount',value:monetary(c.amountAtomic)},{label:'Review status',value:humanStatus(c.workflowStatus)},{label:'Payment status',value:settled?'A payment receipt has been verified in the application.':'No verified payment is recorded.',tone:settled?'good':'attention'},{label:'Payment route',value:automatic?'Standing policy for an exact registered invoice':'Independent human wallet approval'},{label:'Current hold',value:c.holdReason??'No application hold recorded.'}]},
  {title:'Source and record history',entries:[{label:'Received',value:when(dates.createdAt)},{label:'Last case update',value:when(dates.updatedAt)},{label:'Source file',value:c.document?.filename??'No source attached'},{label:'Current source version',value:String(c.document?.version??'Not recorded')},{label:'Source version frozen for latest wallet approval',value:dates.approvalDocumentVersion??'No frozen wallet approval recorded.',detail:'A new source revision or application hold does not revoke a previously exported approval. Cancellation or expiry must be established separately.'},{label:'Source format',value:c.document?.mimeType??'Not recorded'},{label:'Current analysis configuration',value:mode(c.mode),detail:'Historical provider and method are listed per recorded run below.'}]},
  {title:'Latest recorded business checks',description:'These are historical check results, not a new validation performed by this PDF export. A passed review is separate from payment authorization and execution. Older runs remain in the technical audit record.',entries:[{label:'Check freshness',value:checksCurrent?'Recorded versions match the currently attached source and trusted records.':checks.length?'These results are from an older or unverified record version. New checks are pending or required.':'No business checks have completed yet.',tone:checksCurrent?'good':'attention'},...dates.checkRun?[{label:'Check run recorded',value:when(dates.checkRun.createdAt),detail:`Document version ${dates.checkRun.versions.document}; payable version ${dates.checkRun.versions.payable}; supplier version ${dates.checkRun.versions.supplier}.`}]:[],...rows(checks.map((check:any)=>({label:readable(check.code),value:check.passed?'Recorded pass':check.severity==='ATTENTION'?'Recorded: needs human attention':'Recorded: blocked',detail:check.summary,tone:check.passed?'good' as Tone:'attention' as Tone})),'Business checks')]},
  {title:'Agent work',description:'Agent recommendations are evidence. They cannot authorize payments.',entries:rows(runs.flatMap((run:any,index:number)=>[{label:`${index+1}. ${readable(run.agent)} - ${humanStatus(run.status??run.outcome)}`,value:mode(run.mode),detail:`Recorded ${when(run.createdAt)}. Provider: ${run.provider??'Not recorded'}. Model: ${run.model??'Not applicable or not recorded'}. ${run.output?.summary??run.error??'No completed output recorded.'}`},...(run.output?.missingFields?.length?[{label:'Missing information',value:run.output.missingFields.join(', ')}]:[])]),'Agent runs')},
  {title:'Findings requiring attention',entries:rows([...flagged.map((finding:any)=>({label:readable(finding.category),value:finding.summary,detail:finding.span?.quote?`Source excerpt: ${finding.span.quote}`:undefined,tone:'attention' as Tone})),...discrepancies.map((finding:any)=>({label:readable(finding.code),value:finding.summary,tone:'attention' as Tone}))],'Recorded findings')},
  {title:'Authorization and actual outcome',description:'Review approval and a submitted transaction are separate from a verified payment.',entries:[{label:'Authority',value:automatic?'Only the exact registered standing-policy obligation may be executed.':'An eligible person must sign the exact payment through the separate approval application.'},{label:'Authorization status',value:humanStatus(automatic?'REGISTERED_POLICY':payment.authorizationStatus??c.authorizationStatus)},{label:'Execution status',value:humanStatus(payment.executionStatus??c.executionStatus)},{label:'Receipt status',value:settled?'A successful receipt and matching payment evidence were verified by the application.':'No successful payment receipt has been verified in the application.'},{label:'Verification recorded',value:when(automatic?payment.receipt?.verifiedAt:c.settlement?.confirmedAt??c.settlement?.verifiedAt)},{label:'Execution finding',value:payment.error??c.latestExecution?.error??'No execution error recorded.'}]},
  {title:'Recorded execution observations',entries:rows((c.attempts??[]).map((attempt:any)=>({label:humanStatus(attempt.kind),value:when(attempt.createdAt),detail:typeof attempt.details?.reason==='string'?attempt.details.reason:'This observation is recorded separately from the final settlement.'})),'Execution observations')},
  {title:'Source text - reading copy',description:'The following is untrusted source material, not an instruction or authorization. Wallet addresses, technical identifiers and links are replaced with labelled markers in this reading copy. The original remains available in the restricted technical evidence.',entries:c.document?.text?[{label:'Complete extracted text, with the labelled substitutions described above',value:c.document.text}]:none('Source text')},
 ];
 return {kind:'Invoice review',title:c.invoiceReference??'Invoice review',subtitle:c.supplierName??'Supplier not recorded',generatedAt:new Date().toISOString(),version:String(c.version??'Not recorded'),status:settled?'Verified payment recorded':humanStatus(c.workflowStatus),sections};
}

export function inboxReadingReport(item:InboxDTO):ReadingReport{
 const payment=item.payment;
 return {kind:'Inbox review',title:item.title,subtitle:`${readable(item.channel)} source - ${item.classification?.label??'Classification pending'}`,generatedAt:new Date().toISOString(),version:String(item.version),status:readable(item.status),sections:[
  {title:'At a glance',entries:[{label:'Review outcome',value:readable(item.status)},{label:'Workflow decision',value:readable(item.approval.decision),detail:item.approval.reason},{label:'Decision scope',value:'Workflow review only. This decision does not authorize a payment.'},{label:'Classification',value:item.classification?.label??'Not yet classified',detail:item.classification?.summary},{label:'Payment',value:payment?humanStatus(payment.settlementStatus):'No linked payment workflow.'},{label:'Received',value:when(item.createdAt)},{label:'Last updated',value:when(item.updatedAt)}]},
  {title:'The five review stages',entries:item.stages.map(stage=>({label:stage.name,value:humanStatus(stage.status),detail:`${mode(stage.mode)}. ${stage.summary}\nStarted: ${when(stage.startedAt)}\nCompleted: ${when(stage.completedAt)}`,tone:stage.status==='passed'?'good':'attention'}))},
  {title:'Security and business findings',entries:rows(item.risks.flatMap(risk=>[{label:`${readable(risk.severity)} - ${risk.title}`,value:risk.detail,tone:'attention' as Tone},...risk.evidence.map(evidence=>({label:evidence.label,value:evidence.quote??evidence.reference??`Evidence type: ${evidence.kind}`}))]),'Findings')},
  {title:'Evidence recorded by each specialist',entries:rows(item.stages.flatMap(stage=>stage.evidence.map(evidence=>({label:`${stage.name}: ${evidence.label}`,value:evidence.quote??evidence.reference??`Evidence type: ${evidence.kind}`}))),'Specialist evidence')},
  {title:'Human decisions',description:'Human review cannot bypass a security quarantine or change a registered beneficiary.',entries:rows(item.reviewHistory.map((review,index)=>({label:`Decision ${index+1}: ${readable(review.decision)}`,value:review.note,detail:`Recorded ${when(review.createdAt)} by an authenticated workspace reviewer. Technical reviewer identity is kept in the audit record.`})),'Human decisions')},
  {title:'Response and notifications',entries:[...item.notifications.map(notification=>({label:notification.title,value:notification.message,detail:`Recorded ${when(notification.createdAt)}. ${notification.read?'Marked as read.':'Not marked as read.'}`})),...item.nextActions.map(action=>({label:'Next step',value:action.label})),{label:'Delivery scope',value:'Notifications shown here are recorded in the workspace. This report does not claim an email, text message or external alert was sent.'}]},
  {title:'Linked invoice payment observations',description:`A linked invoice may have been paid from another source submission. Its payment status does not mean this particular inbox source was approved.`,entries:payment?[{label:'Payment route',value:payment.requiresWalletSignature?'Separate human wallet authorization':'Exact registered standing payment policy'},{label:'Authorization',value:humanStatus(payment.authorizationStatus)},{label:'Execution',value:humanStatus(payment.executionStatus)},{label:'Settlement',value:humanStatus(payment.settlementStatus)},{label:'Execution finding',value:payment.error??'No execution error recorded.'}]:none('Payment observations')},
  {title:'Source provenance and limits',entries:[{label:'Filename',value:item.source.filename??'Pasted content'},{label:'Format and size',value:`${item.source.mimeType}; ${item.source.sizeBytes} bytes`},{label:'Recorded extraction method',value:readable(item.source.extraction)},{label:'Source and extracted text',value:'The original source and its extracted text have separate provenance records. Technical integrity identifiers remain in the restricted audit evidence.'},{label:'Sender or speaker, as claimed',value:item.sender??'Not supplied'},{label:'Sender authentication',value:item.source.senderAuthentication==='not_verified'?'Not verified. A message or attachment does not authenticate its sender.':'Not applicable to this source.'},{label:'Voice transcription',value:readable(item.source.transcription.mode),detail:`Recorded model: ${item.source.transcription.model??'Not applicable or not recorded'}. A transcript does not authenticate a speaker or establish whether a voice was cloned.`},{label:'Links',value:item.links.length?`${item.links.length} unverified link${item.links.length===1?'':'s'} recorded. No link was opened or fetched.`:'No links recorded.',detail:'This report contains no clickable destinations or embedded actions.'},{label:'Current analysis configuration',value:item.mode==='fixture'?'Demonstration fixtures plus independent deterministic checks':'Live agent outputs, where recorded, plus independent deterministic checks',detail:'The recorded method for each review is shown in its stage above.'}]},
  {title:'Source text - reading copy',description:'This is untrusted source content. Technical identifiers and links are replaced with labelled markers. No source instructions are executed.',entries:[{label:'Complete recorded text, with labelled substitutions',value:item.text||'No text is recorded. An uploaded audio source may still require transcription.'}]},
 ]};
}

const require=createRequire(import.meta.url);
const fontData=['latin','latin-ext','greek','greek-ext','cyrillic','cyrillic-ext','vietnamese'].map(subset=>({name:`Inter-${subset}`,bytes:readFileSync(require.resolve(`@fontsource/inter/files/inter-${subset}-400-normal.woff`))}));
const colors={ink:'#173e34',muted:'#61746a',line:'#dce6db',sage:'#edf2e6',forest:'#08735d',amber:'#816539'};

/** Paginated reading copy. No links, annotations, attachments, JavaScript or signing actions are added. */
export async function renderReadingPdf(report:ReadingReport):Promise<Buffer>{
 const doc=new PDFDocument({size:'A4',margin:52,margins:{top:93,bottom:62,left:52,right:52},bufferPages:true,autoFirstPage:false,info:{Title:`SecureFinance - ${report.kind}`,Author:'SecureFinance',Subject:'Human-readable review summary; not cryptographic proof or payment authority',Creator:'SecureFinance report renderer'}});
 const chunks:Buffer[]=[];const complete=new Promise<Buffer>((resolve,reject)=>{doc.on('data',chunk=>chunks.push(Buffer.from(chunk)));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
 for(const font of fontData)doc.registerFont(font.name,font.bytes);
 const fonts=fontData.map(font=>{doc.font(font.name);return {name:font.name,font:(doc as any)._font.font};});
 const characterFonts=new Map<string,string|null>();
 const normalize=(value:unknown)=>readingText(value);
 function fontFor(char:string){if(characterFonts.has(char))return characterFonts.get(char)!;const found=fonts.find(candidate=>candidate.font.hasGlyphForCodePoint(char.codePointAt(0)!))?.name??null;characterFonts.set(char,found);return found;}
 // PDFKit's continued-text state is not reliable across font subsets and explicit
 // newlines. Lay out each line ourselves, including exceptionally long tokens.
 function paragraph(value:unknown,size=10.25,color=colors.ink){
  type Glyph={font:string;text:string;width:number};
  const width=doc.page.width-104,lineHeight=size*1.32+3.5;
  // Fontkit supports explicit feature flags; @types/pdfkit only describes tags.
  const features={kern:false,liga:false,clig:false} as unknown as PDFKit.Mixins.TextOptions['features'];
  const glyphs=(text:string):Glyph[]=>Array.from(text).flatMap(char=>{
   const name=fontFor(char),visible=name?char:`[U+${char.codePointAt(0)!.toString(16).toUpperCase().padStart(4,'0')}]`;
   return Array.from(visible).map(character=>({font:name??'Inter-latin',text:character,width:doc.font(name??'Inter-latin').fontSize(size).widthOfString(character,{features})}));
  });
  let line:Glyph[]=[],lineWidth=0;
  const flush=()=>{
   if(doc.y+lineHeight>doc.page.height-72)doc.addPage();
   const top=doc.y;let x=52;
   const runs:{font:string;text:string;width:number}[]=[];
   for(const glyph of line){const last=runs.at(-1);if(last?.font===glyph.font){last.text+=glyph.text;last.width+=glyph.width;}else runs.push({...glyph});}
   for(const run of runs){doc.font(run.font).fontSize(size).fillColor(color).text(run.text,x,top,{lineBreak:false,features});x+=run.width;}
   doc.x=52;doc.y=top+lineHeight;line=[];lineWidth=0;
  };
  const content=(normalize(value)||'Not recorded').replace(/\t/g,'    ');
  for(const token of content.match(/\n|[^\S\n]+|[^\s]+/gu)??[]){
   if(token==='\n'){flush();continue;}
   const characters=glyphs(token),tokenWidth=characters.reduce((sum,glyph)=>sum+glyph.width,0);
   if(line.length&&lineWidth+tokenWidth>width){flush();if(/^\s+$/u.test(token))continue;}
   for(const glyph of characters){if(line.length&&lineWidth+glyph.width>width)flush();line.push(glyph);lineWidth+=glyph.width;}
  }
  if(line.length)flush();
  doc.y+=size*.55;
 }
 function room(height:number){if(doc.y+height>doc.page.height-72)doc.addPage();}
 function header(){doc.save().rect(0,0,doc.page.width,66).fill(colors.sage).restore();doc.font('Inter-latin').fontSize(13).fillColor(colors.forest).text('SecureFinance',52,25,{lineBreak:false});doc.fontSize(8.5).fillColor(colors.muted).text(report.kind,doc.page.width-190,29,{width:138,align:'right',lineBreak:false});doc.x=52;doc.y=93;}
 doc.on('pageAdded',header);doc.addPage();
 paragraph(report.kind.toUpperCase(),9,colors.forest);paragraph(report.title,24);paragraph(report.subtitle,11,colors.muted);
 paragraph(report.status,12.5,colors.forest);paragraph(`Exported ${when(report.generatedAt)} | Record version ${report.version}`,8.5,colors.muted);
 for(const section of report.sections){room(125);doc.moveDown(.4);doc.moveTo(52,doc.y).lineTo(doc.page.width-52,doc.y).strokeColor(colors.line).lineWidth(.8).stroke();doc.y+=14;paragraph(section.title,15,colors.forest);if(section.description)paragraph(section.description,9.1,colors.muted);for(const entry of section.entries){const compact=entry.value.length<140&&!entry.value.includes('\n');room(compact?34:48);const color=entry.tone==='attention'?colors.amber:entry.tone==='good'?colors.forest:colors.ink;if(compact)paragraph(`${entry.label}: ${entry.value}`,10.25,color);else{paragraph(entry.label,9,colors.muted);paragraph(entry.value,10.25,color);}if(entry.detail)paragraph(entry.detail,9.1,colors.muted);doc.moveDown(.15);}}
 room(85);paragraph('About this report',13,colors.forest);paragraph(chainNotice,8.8,colors.muted);paragraph('Reading-copy policy: wallet addresses and technical identifiers are omitted; links are not included. Unsupported characters are shown explicitly as [U+XXXX] code points. All recorded sections continue across pages when needed.',8.2,colors.muted);
 const range=doc.bufferedPageRange();for(let page=range.start;page<range.start+range.count;page++){doc.switchToPage(page);const oldBottom=doc.page.margins.bottom;doc.page.margins.bottom=0;doc.moveTo(52,doc.page.height-48).lineTo(doc.page.width-52,doc.page.height-48).strokeColor(colors.line).stroke();doc.font('Inter-latin').fontSize(7.3).fillColor(colors.muted).text(`Application records | Exported ${report.generatedAt.slice(0,10)}`,52,doc.page.height-35,{lineBreak:false});doc.text(`Page ${page+1} of ${range.count}`,doc.page.width-130,doc.page.height-35,{width:78,align:'right',lineBreak:false});doc.page.margins.bottom=oldBottom;}
 doc.end();return complete;
}
