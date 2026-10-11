import {lazy,Suspense,useCallback,useEffect,useRef,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {ArrowRight,ShieldCheck,Wallet,WifiOff,X} from 'lucide-react';
import {post,request,useData,useEvents} from './api';
import type {Session} from './types';
import {Button,Modal} from '../components/ui';
import type {InboxNotification} from '../features/inbox/types';
import WorkflowPage from '../features/workflow/WorkflowPage';
import {normalizeLocation} from '../features/workflow/location';
const LandingPage=lazy(()=>import('../features/landing/LandingPage'));
type Provider={request:(args:{method:string;params?:unknown[]})=>Promise<unknown>};
declare global{interface Window{ethereum?:Provider}}
function currentLocation(){const original=window.location.pathname+window.location.search;const normalized=normalizeLocation(original);if(normalized!==original)window.history.replaceState(window.history.state,'',normalized);return normalized;}
function useLocation(){
 const [location,setLocation]=useState(currentLocation);
 useEffect(()=>{const pop=()=>setLocation(currentLocation());window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop);},[]);
 const navigate=useCallback((to:string)=>{const next=normalizeLocation(to);if(next===window.location.pathname+window.location.search)return;window.history.pushState({},'',next);setLocation(next);window.dispatchEvent(new Event('sf:navigate'));},[]);
 return [location,navigate] as const;
}
export default function App(){
 const [location,navigate]=useLocation();
 const data=useData(),client=useQueryClient();
 const authenticated=data.session.data?.authenticated===true,cases=authenticated?data.cases.data?.cases||[]:[];
 const connected=useEvents(authenticated);
 const [login,setLogin]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const actionLock=useRef(false),noticeTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 const notify=useCallback((message:string)=>{setNotice(message);clearTimeout(noticeTimer.current);noticeTimer.current=setTimeout(()=>setNotice(''),10000);},[]);
 const notifications=useQuery({queryKey:['inbox-notifications'],queryFn:()=>request<{notifications:InboxNotification[]}>('/inbox/notifications'),enabled:authenticated,refetchInterval:6000});
 useEffect(()=>()=>clearTimeout(noticeTimer.current),[]);
 useEffect(()=>{document.title=location==='/'?'SecureFinance — Connected finance':'SecureFinance — Your workflow';},[location]);
 async function finishLogin(session:Session){client.setQueryData(['session'],session);await client.invalidateQueries({queryKey:['session']});await client.invalidateQueries({queryKey:['inbox']});setLogin(false);}
 async function demoLogin(){
  if(actionLock.current)return;actionLock.current=true;setBusy(true);
  try{const session=await post<Session>('/auth/demo');await finishLogin(session);notify('Welcome to your demo workspace. Try an example to see the checks in action.');}
  catch(e){notify(e instanceof Error?e.message:'The demo could not start. Try again.');}
  finally{actionLock.current=false;setBusy(false);}
 }
 async function signIn(){
  if(actionLock.current)return;actionLock.current=true;setBusy(true);
  try{
   if(!window.ethereum)throw new Error('A wallet is needed for this network. Open this page in a browser with your enrolled wallet. For a wallet-free demonstration, run the isolated demo.');
   const accounts=await window.ethereum.request({method:'eth_requestAccounts'}) as string[];
   const address=accounts[0];if(!address)throw new Error('No account selected. Choose your workspace wallet and try again.');
   const actualChain=await window.ethereum.request({method:'eth_chainId'}) as string;
   const expected=BigInt(data.config.data?.chainId||'31337');
   if(BigInt(actualChain)!==expected)throw new Error(`Switch your wallet to ${expected===43113n?'Avalanche Fuji':'the local demo network'}, then try again.`);
   const challenge=await post<{challengeId:string;message:string}>('/auth/challenge',{address:address.toLowerCase()});
   const hex='0x'+Array.from(new TextEncoder().encode(challenge.message),b=>b.toString(16).padStart(2,'0')).join('');
   const signature=await window.ethereum.request({method:'personal_sign',params:[hex,address]}) as string;
   await finishLogin(await post<Session>('/auth/verify',{challengeId:challenge.challengeId,signature}));
   notify('You are signed in. Signing in does not authorize a payment.');
  }catch(e){notify(e instanceof Error?e.message:'Could not sign in. Please try again.');}
  finally{actionLock.current=false;setBusy(false);}
 }
 async function logout(){try{await post('/auth/logout');client.clear();setLogin(false);navigate('/');notify('Signed out. Your saved work is still here.');}catch(e){notify(e instanceof Error?e.message:'Sign out failed. Please try again.');}}
 return <>
  {location==='/'?<Suspense fallback={<div className="wf-app" style={{display:'grid',placeItems:'center',minHeight:'100svh'}} role="status">Opening SecureFinance…</div>}><LandingPage onStart={()=>{navigate('/workflow');window.scrollTo({top:0,behavior:'instant'});}}/></Suspense>:<>
   {data.config.isError&&<div className="connection-banner" role="alert"><WifiOff size={16}/><span>The workspace is unavailable.</span><button onClick={()=>{void data.config.refetch();void data.session.refetch();}}>Try again</button></div>}
   <WorkflowPage location={location} navigate={navigate} authenticated={authenticated} cases={cases} payables={authenticated?data.payables.data?.payables||[]:[]} config={data.config.data} session={data.session.data} connected={connected} onLogin={()=>setLogin(true)} onLogout={()=>void logout()} onNotice={notify} unreadCount={authenticated?notifications.data?.notifications.filter(n=>!n.read).length||0:0}/>
  </>}
  <Modal open={login} onOpenChange={setLogin} title="Welcome to SecureFinance" description="Choose how to open your workspace.">
   <div className="login-icon"><ShieldCheck size={40}/></div>
   <div className="login-copy"><h3>Your workspace is ready.</h3><p>{data.config.data?.demoLoginAvailable?'Explore your saved demonstration. No wallet setup is needed.':'Sign in with your enrolled wallet. This login does not authorize a payment.'}</p></div>
   {data.config.data?.demoLoginAvailable&&<Button className="primary full-width" busy={busy} onClick={()=>void demoLogin()}>Explore the demo <ArrowRight size={17}/></Button>}
   <Button className={`${data.config.data?.demoLoginAvailable?'':'primary '}full-width`} busy={busy} onClick={()=>void signIn()}><Wallet size={17}/>{data.config.data?.demoLoginAvailable?'Use my own wallet':'Connect & sign login'}</Button>
  </Modal>
  {notice&&<div className="toast" role="status"><span>{notice}</span><button aria-label="Dismiss notification" onClick={()=>setNotice('')}><X size={16}/></button></div>}
 </>;
}
