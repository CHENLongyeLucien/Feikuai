import {useEffect, useState, type ReactNode} from 'react';
import {ArrowDownLeft, ArrowUpRight, Bell, Boxes, ChevronDown, CircleHelp, FileCheck2, Inbox, Landmark, Leaf, LogOut, Menu, PlugZap, Search, Settings2, ShieldCheck, X} from 'lucide-react';
import './inbox.css';

export type InboxShellProps = {
  children: ReactNode; path: string; navigate: (path: string) => void;
  authenticated: boolean; localDemo?: boolean; onLogin: () => void;
  onLogout?: () => void; onSearch?: (query: string) => void; search?: string;
  unreadCount?: number; onNew?: () => void;
};

export function InboxShell({children, path, navigate, authenticated, localDemo, onLogin, onLogout, onSearch, search, unreadCount = 0, onNew}: InboxShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 600px)').matches);
  useEffect(() => {const media = window.matchMedia('(max-width: 600px)'); const change = () => {setIsMobile(media.matches); if (!media.matches) setMobileOpen(false);}; media.addEventListener('change', change); return () => media.removeEventListener('change', change);}, []);
  useEffect(() => {if (!mobileOpen) return; const close = (event: KeyboardEvent) => {if (event.key === 'Escape') {setMobileOpen(false); requestAnimationFrame(() => document.getElementById('sf-menu-toggle')?.focus());}}; window.addEventListener('keydown', close); requestAnimationFrame(() => document.querySelector<HTMLAnchorElement>('#sf-navigation nav a')?.focus()); return () => window.removeEventListener('keydown', close);}, [mobileOpen]);
  const go = (url: string) => {navigate(url); setMobileOpen(false);};
  const links = [
    {url: '/', label: 'Inbox', icon: Inbox, match: path === '/' || path.startsWith('/inbox')},
    {url: '/review', label: 'Needs review', icon: ShieldCheck, match: path === '/review'},
    {url: '/notifications', label: 'Activity', icon: Bell, match: path === '/notifications'},
    {url: '/workspace', label: 'Payments', icon: Landmark, match: path === '/workspace' || path.startsWith('/cases') || path === '/payments'},
    {url: '/evidence', label: 'Audit trail', icon: FileCheck2, match: path === '/evidence'},
  ];
  return <div className="sf-shell">
    <aside id="sf-navigation" className={`sf-sidebar ${mobileOpen ? 'is-open' : ''}`} aria-label="Workspace navigation" inert={isMobile && !mobileOpen} aria-hidden={isMobile && !mobileOpen ? true : undefined}>
      <a className="sf-brand" href="/" onClick={e => {e.preventDefault(); go('/');}}><span className="sf-brand-icon"><Leaf size={23} strokeWidth={1.8}/></span><span>SecureFinance<small>Clarity before every decision.</small></span></a>
      <button className="sf-workspace-switch" onClick={() => go('/settings')}><span className="sf-workspace-avatar">N</span><span>Northstar Labs<small>{localDemo ? 'Demo workspace' : 'Finance workspace'}</small></span><ChevronDown size={15}/></button>
      <div className="sf-nav-section">WORKSPACE</div>
      <nav>{links.map(({url, label, icon: Icon, match}) => <a key={url} href={url} className={match ? 'is-active' : ''} aria-current={match ? 'page' : undefined} onClick={e => {e.preventDefault(); go(url);}}><Icon size={19}/><span>{label}</span>{url === '/notifications' && unreadCount > 0 && <span className="sf-nav-count">{unreadCount}</span>}</a>)}</nav>
      <div className="sf-nav-section sf-nav-secondary">YOUR TOOLS</div>
      <nav><a href="/connections" className={path === '/connections' ? 'is-active' : ''} onClick={e => {e.preventDefault(); go('/connections');}}><PlugZap size={19}/>Connections</a><a href="/operations" className={path === '/operations' ? 'is-active' : ''} onClick={e => {e.preventDefault(); go('/operations');}}><Boxes size={19}/>Operations campus<ArrowUpRight size={14} className="sf-nav-end"/></a><a href="/settings" className={path === '/settings' ? 'is-active' : ''} onClick={e => {e.preventDefault(); go('/settings');}}><Settings2 size={19}/>Settings</a></nav>
      <div className="sf-sidebar-bottom"><div className="sf-trust-note"><span><ShieldCheck size={18}/>You're in control</span><p>AI checks the details.<br/>You own the important decisions.</p></div><button className="sf-help-link" onClick={() => go('/connections')}><CircleHelp size={17}/>How it works <ArrowUpRight size={14}/></button><div className="sf-workspace-label"><span/>{localDemo ? 'Synthetic data · no real funds' : 'Protected finance workspace'}</div></div>
    </aside>
    {mobileOpen && <button className="sf-mobile-scrim" onClick={() => setMobileOpen(false)} aria-label="Close navigation"/>}
    <div className="sf-main" inert={isMobile && mobileOpen} aria-hidden={isMobile && mobileOpen ? true : undefined}>
      <header className="sf-topbar"><button id="sf-menu-toggle" className="sf-mobile-menu sf-icon-btn" aria-controls="sf-navigation" aria-expanded={mobileOpen} onClick={() => setMobileOpen(!mobileOpen)} aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}>{mobileOpen ? <X size={21}/> : <Menu size={21}/>}</button><div className="sf-topbar-crumb"><span>Workspace</span><span>/</span><strong>{path.startsWith('/inbox/') ? 'Message review' : path === '/review' ? 'Needs review' : path === '/connections' ? 'Connections' : path === '/notifications' ? 'Activity' : path === '/operations' ? 'Operations' : path === '/' || path === '/inbox' ? 'Inbox' : 'Finance'}</strong></div><label className="sf-search"><Search size={17}/><input value={search} onChange={e => onSearch?.(e.target.value)} aria-label="Search your workspace" placeholder="Search your workspace"/><span>⌘ K</span></label><button className="sf-icon-btn sf-notification-button" aria-label="View activity" onClick={() => go('/notifications')}><Bell size={20}/>{unreadCount > 0 && <i/>}</button><div className="sf-account"><button className="sf-account-button" onClick={authenticated ? () => setAccountOpen(!accountOpen) : onLogin}><span className="sf-account-avatar">{authenticated ? 'NL' : <ArrowDownLeft size={18}/>}</span><span>{authenticated ? 'Northstar team' : 'Sign in'}<small>{authenticated ? 'Workspace member' : 'Your secure workspace'}</small></span><ChevronDown size={14}/></button>{accountOpen && <div className="sf-account-menu"><button onClick={() => {go('/settings'); setAccountOpen(false);}}><Settings2 size={16}/>Workspace settings</button>{onLogout && <button onClick={() => {setAccountOpen(false); onLogout();}}><LogOut size={16}/>Sign out</button>}</div>}</div></header>
      {children}
    </div>
  </div>;
}
