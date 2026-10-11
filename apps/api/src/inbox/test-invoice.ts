import PDFDocument from 'pdfkit';
import {fixtureText} from '../db/seed.js';
import type {Service} from '../domain/service.js';

/** A source invoice for the exact existing test obligation, never an approval or receipt. */
export async function renderTestInvoicePdf(payable:ReturnType<Service['payable']>):Promise<Buffer>{
 const doc=new PDFDocument({size:'A4',margin:48,info:{Title:`Test invoice ${payable.invoiceReference}`,Author:'SecureFinance',Subject:'Synthetic 10-DEMO invoice for workflow testing'}});
 const chunks:Buffer[]=[];const output=new Promise<Buffer>((resolve,reject)=>{doc.on('data',chunk=>chunks.push(Buffer.from(chunk)));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
 doc.rect(0,0,doc.page.width,116).fill('#173e34');
 doc.fillColor('#d8f569').font('Helvetica-Bold').fontSize(11).text('SECUREFINANCE / TEST DOCUMENT',48,33);
 doc.fillColor('#ffffff').fontSize(24).text('10.00 DEMO',48,61);
 doc.fillColor('#173e34').font('Helvetica-Bold').fontSize(15).text(payable.supplierName,48,149,{width:490});
 doc.font('Helvetica').fontSize(10).fillColor('#61746a').text('A synthetic invoice for the current test workspace.',48,179);
 doc.font('Courier').fontSize(8).fillColor('#173e34');
 const lines=fixtureText(payable).replace(/[\u2010-\u2015]/g,'-').trim().split(/\r?\n/);
 let y=218;for(const line of lines){doc.text(line,48,y,{width:499,lineGap:3});y=doc.y+9;}
 doc.moveTo(48,y+18).lineTo(doc.page.width-48,y+18).strokeColor('#dce6db').stroke();
 doc.font('Helvetica-Bold').fontSize(11).fillColor('#173e34').text('How to use',48,y+38);
 doc.font('Helvetica').fontSize(10).fillColor('#61746a').text('Upload this PDF using Add to inbox > Invoice. Downloading it does not reserve the invoice or perform a payment. Once paid, this invoice cannot be paid a second time.',48,y+60,{width:490,lineGap:4});
 doc.text('DEMO tokens have no monetary value. Any payment follows the separate wallet approval process.',48,y+120,{width:490,lineGap:4});
 doc.end();return output;
}
