/**
 * Detects which kind of source a submission is, so users never have to choose.
 * The result only routes intake (MIME decoding, transcription, how strictly a short message is judged);
 * every security and finance check still runs on the content itself.
 */
export type SourceChannel='invoice'|'email'|'voice'|'text';
export type ChannelDetection={channel:SourceChannel;reason:string};
const AUDIO_EXTENSION=/\.(?:mp3|wav|m4a|ogg|oga|webm|mp4|aac|flac|amr)$/i;

/** From the file alone (name and type), before its content is read. Null when the content decides. */
export function detectFromFile(file:{filename:string;mimeType:string}):ChannelDetection|null{
 const mime=file.mimeType.split(';')[0]!.trim().toLowerCase();
 if(mime==='message/rfc822'||/\.eml$/i.test(file.filename))return {channel:'email',reason:'Email file (.eml)'};
 if(mime.startsWith('audio/')||(mime==='video/webm'||mime==='video/mp4')&&AUDIO_EXTENSION.test(file.filename)||AUDIO_EXTENSION.test(file.filename)&&!mime.startsWith('text/'))return {channel:'voice',reason:'Audio recording'};
 return null;
}

/** From readable content: email headers, a transcript, invoice fields, or a plain message. */
export function detectFromText(text:string,hint:{pdf?:boolean}={}):ChannelDetection{
 const head=text.slice(0,3000);
 const headers=new Set([...head.split(/\r?\n/,25).join('\n').matchAll(/^(from|to|subject|date|cc|reply-to|message-id)\s*:/gim)].map(m=>m[1]!.toLowerCase()));
 if(headers.size>=2&&(headers.has('from')||headers.has('subject')))return {channel:'email',reason:'Email headers (From, Subject)'};
 const invoiceReference=/\b(?:invoice|facture)\s*(?:reference|number|no\.?|n[°ºo]|#|num[eé]ro|r[eé]f[eé]rence)?\s*[:：#-]\s*[A-Za-z0-9][A-Za-z0-9._\/-]*\d/i.test(head);
 const amountLine=/\b(?:amount(?:\s+due)?|total(?:\s+due)?|montant(?:\s+total)?|net\s+[aà]\s+payer)\s*[:：]?\s*(?:[A-Z]{2,8}\s+)?-?\d/i.test(head);
 const invoiceWord=/\b(?:invoice|facture|bill to|remit to)\b/i.test(head);
 if(invoiceReference&&(amountLine||invoiceWord)||invoiceWord&&amountLine)return {channel:'invoice',reason:'Invoice fields (reference and amount)'};
 if(/^\s*(?:\[?(?:transcript|voicemail|voice message|call transcript|call recording)\]?\b)|^\s*(?:caller|speaker\s*\d*|agent|customer)\s*:/im.test(head))return {channel:'voice',reason:'Call transcript markers'};
 if(hint.pdf&&invoiceWord)return {channel:'invoice',reason:'PDF invoice document'};
 return {channel:'text',reason:hint.pdf?'PDF document without invoice fields':'Plain message'};
}
