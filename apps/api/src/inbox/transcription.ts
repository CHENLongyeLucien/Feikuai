import OpenAI,{toFile} from 'openai';
import type {Config} from '../config.js';
import {fail} from '../domain/errors.js';

export function transcriptionModel(){return (process.env.INBOX_TRANSCRIPTION_MODEL??'').trim();}
export function validateAudio(bytes:Uint8Array,mimeType:string){
 if(bytes.length>10*1024*1024)fail('UPLOAD_TOO_LARGE','Voice uploads are limited to 10 MiB.',413);
 const h=Buffer.from(bytes.slice(0,16));
 const signatures:Record<string,boolean>={
  'audio/mpeg':h.subarray(0,3).toString()==='ID3'||(h[0]===0xff&&((h[1]??0)&0xe0)===0xe0),
  'audio/wav':h.subarray(0,4).toString()==='RIFF'&&h.subarray(8,12).toString()==='WAVE',
  'audio/x-wav':h.subarray(0,4).toString()==='RIFF'&&h.subarray(8,12).toString()==='WAVE',
  'audio/ogg':h.subarray(0,4).toString()==='OggS',
  'audio/webm':h.subarray(0,4).toString('hex')==='1a45dfa3',
  'audio/mp4':h.subarray(4,8).toString()==='ftyp',
  'audio/x-m4a':h.subarray(4,8).toString()==='ftyp',
  'audio/flac':h.subarray(0,4).toString()==='fLaC',
 };
 if(!signatures[mimeType])fail('UNSUPPORTED_AUDIO','Use a valid MP3, WAV, OGG, WebM, M4A or FLAC voice file, or paste a manual transcript.');
}
export async function transcribe(bytes:Uint8Array,filename:string,mimeType:string,config:Config,model:string){
 if(!config.OPENAI_API_KEY||!model)fail('TRANSCRIPTION_NOT_CONFIGURED','Paste a transcript or configure OPENAI_API_KEY and INBOX_TRANSCRIPTION_MODEL.',409);
 const start=Date.now(),client=new OpenAI({apiKey:config.OPENAI_API_KEY,maxRetries:0,timeout:60000});
 const result=await client.audio.transcriptions.create({file:await toFile(bytes,filename,{type:mimeType}),model,response_format:'json'},{signal:AbortSignal.timeout(60000)});
 if(!result.text?.trim()||result.text.length>40000)fail('TRANSCRIPT_UNSUPPORTED','The complete transcript must contain text and fit within 40,000 characters.');
 return {text:result.text,artifact:{provider:'openai',model,durationMs:Date.now()-start,usage:(result as any).usage??null,requests:1,provenance:'Audio transcription does not verify speaker identity or prove that a voice is authentic.'}};
}
