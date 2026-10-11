import {describe,expect,it} from 'vitest';
import {detectFromFile,detectFromText} from '@secure-finance/shared';

describe('automatic source type detection',()=>{
 it('detects by file type first',()=>{
  expect(detectFromFile({filename:'note.eml',mimeType:'application/octet-stream'})?.channel).toBe('email');
  expect(detectFromFile({filename:'call.wav',mimeType:'audio/wav'})?.channel).toBe('voice');
  expect(detectFromFile({filename:'memo.m4a',mimeType:''})?.channel).toBe('voice');
  expect(detectFromFile({filename:'invoice.pdf',mimeType:'application/pdf'})).toBeNull();
  expect(detectFromFile({filename:'notes.txt',mimeType:'text/plain'})).toBeNull();
 });
 it('detects by content',()=>{
  expect(detectFromText('From: Dana <d@example.invalid>\nSubject: Agenda\n\nHello').channel).toBe('email');
  expect(detectFromText('ATLAS - INVOICE\nInvoice reference: NS-TEST10-0005\nAmount: 10.00 DEMO').channel).toBe('invoice');
  expect(detectFromText('Facture n°: QB-10-0004\nMontant total: 10,00 DEMO').channel).toBe('invoice');
  expect(detectFromText('Transcript\nCaller: please wire the payment today').channel).toBe('voice');
  expect(detectFromText('Could you please schedule a meeting next week?').channel).toBe('text');
  expect(detectFromText('Can you tell me whether the invoice was paid?').channel).toBe('text');
 });
 it('treats a PDF without invoice wording as a document, not an invoice',()=>{
  expect(detectFromText('Quarterly newsletter: new regions and roadmap.',{pdf:true}).channel).toBe('text');
  expect(detectFromText('Invoice for October services, see attached schedule.',{pdf:true}).channel).toBe('invoice');
 });
});
