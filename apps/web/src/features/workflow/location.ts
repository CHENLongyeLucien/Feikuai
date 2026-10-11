export type WorkflowPanel = 'reports'|'alerts'|'settings';
export type WorkflowLocation = {itemId:string|null;caseId:string|null;panel:WorkflowPanel|null;filter:'all'|'review'|'payments';compose:'invoice'|'email'|'voice'|'text'|null};
const validPanels = new Set(['reports','alerts','settings']);
const decode=(value:string)=>{try{return decodeURIComponent(value);}catch{return value;}};
const validSources = new Set(['invoice','email','voice','text']);
/** Old bookmarks retain their context inside the single workspace. */
export function normalizeLocation(input:string):string {
 const url=new URL(input,'http://workspace.local');
 if(url.pathname==='/'&&!url.searchParams.has('new')&&!url.searchParams.has('filter'))return '/';
 const inbox=url.pathname.match(/^\/inbox\/([^/]+)$/),invoice=url.pathname.match(/^\/cases\/([^/]+)$/);
 if(inbox)url.searchParams.set('item',decode(inbox[1]!));
 if(invoice){url.searchParams.set('case',decode(invoice[1]!));url.searchParams.delete('item');}
 if(url.pathname==='/review')url.searchParams.set('filter','review');
 if(['/workspace','/payments'].includes(url.pathname))url.searchParams.set('filter','payments');
 if(url.pathname==='/evidence')url.searchParams.set('panel','reports');
 if(url.pathname==='/notifications')url.searchParams.set('panel','alerts');
 if(url.pathname==='/settings')url.searchParams.set('panel','settings');
 url.pathname='/workflow';
 return url.pathname+url.search;
}
export function readWorkflowLocation(input:string):WorkflowLocation {
 const q=new URL(input,'http://workspace.local').searchParams;
 return {itemId:q.get('item'),caseId:q.get('case'),panel:validPanels.has(q.get('panel')||'')?q.get('panel') as WorkflowPanel:null,filter:['review','payments'].includes(q.get('filter')||'')?q.get('filter') as 'review'|'payments':'all',compose:validSources.has(q.get('new')||'')?q.get('new') as WorkflowLocation['compose']:null};
}
export function workflowUrl(current:string,changes:Record<string,string|null>):string{
 const url=new URL(current,'http://workspace.local');url.pathname='/workflow';
 for(const [key,value] of Object.entries(changes))if(value===null)url.searchParams.delete(key);else url.searchParams.set(key,value);
 return url.pathname+url.search;
}
