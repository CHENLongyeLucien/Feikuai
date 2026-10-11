import {describe,it,expect} from 'vitest';
import {normalizeLocation,readWorkflowLocation,workflowUrl} from './location';
describe('single workspace bookmarks',()=>{
 it('keeps the opening experience at the root',()=>expect(normalizeLocation('/')).toBe('/'));
 it.each([['/inbox/source-one','/workflow?item=source-one'],['/cases/invoice-one','/workflow?case=invoice-one'],['/review','/workflow?filter=review'],['/dashboard','/workflow?panel=dashboard'],['/settings','/workflow?panel=settings'],['/evidence','/workflow?panel=reports'],['/notifications','/workflow?panel=alerts'],['/agents','/workflow'],['/business','/workflow'],['/operations','/workflow']])('preserves the intent of %s',(before,after)=>expect(normalizeLocation(before)).toBe(after));
 it('preserves an intake request through the landing redirect',()=>expect(readWorkflowLocation(normalizeLocation('/?new=invoice'))).toMatchObject({compose:'invoice'}));
 it('keeps malformed legacy identifiers from crashing navigation',()=>expect(normalizeLocation('/cases/bad%ZZ')).toBe('/workflow?case=bad%25ZZ'));
 it('ignores unknown commands from bookmarks',()=>expect(readWorkflowLocation('/workflow?panel=execute&filter=approved&new=pay')).toMatchObject({panel:null,filter:'all',compose:null}));
 it('keeps selection when opening and closing an auxiliary drawer',()=>{const next=workflowUrl('/workflow?item=one',{panel:'reports'});expect(readWorkflowLocation(next)).toMatchObject({itemId:'one',panel:'reports'});expect(workflowUrl(next,{panel:null})).toBe('/workflow?item=one');});
 it('keeps a selected payment when opening and closing Dashboard',()=>{const next=workflowUrl('/workflow?case=invoice-one',{panel:'dashboard'});expect(readWorkflowLocation(next)).toMatchObject({caseId:'invoice-one',panel:'dashboard'});expect(workflowUrl(next,{panel:null})).toBe('/workflow?case=invoice-one');});
 it('encodes identifiers instead of interpreting them as query instructions',()=>{const next=workflowUrl('/workflow',{item:'one&panel=settings',case:null});expect(readWorkflowLocation(next)).toMatchObject({itemId:'one&panel=settings',panel:null});});
});
