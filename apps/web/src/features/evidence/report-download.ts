import {request} from '../../app/api';

/** Fetch the authenticated report before offering a real PDF download. */
export async function downloadPdfReport(path:string,filename:string){
 const blob=await request<Blob>(path);
 if(!(blob instanceof Blob)||!blob.type.toLowerCase().includes('application/pdf')||await blob.slice(0,5).text()!=='%PDF-')throw new Error('The server did not return a readable PDF report. Please try again.');
 const url=URL.createObjectURL(blob),anchor=document.createElement('a');
 anchor.href=url;anchor.download=filename.replace(/[^a-zA-Z0-9._-]+/g,'-');
 document.body.appendChild(anchor);anchor.click();anchor.remove();
 setTimeout(()=>URL.revokeObjectURL(url),60000);
}
