import {useEffect, useRef, useState, type ReactNode} from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {Activity, ArrowDownLeft, ArrowRight, ArrowUpRight, Bell, Boxes, ChartNoAxesCombined, ChevronDown, FileCheck2, Inbox, Landmark, Leaf, LogOut, MoreHorizontal, PlugZap, Search, Settings2, ShieldCheck, X} from 'lucide-react';
import './inbox.css';

export type InboxShellProps = {
  children: ReactNode; path: string; navigate: (path: string) => void;
  authenticated: boolean; localDemo?: boolean; onLogin: () => void;
  onLogout?: () => void; onSearch?: (query: string) => void; search?: string;
  unreadCount?: number; onNew?: () => void;
};

export function InboxShell({children, path, navigate, authenticated, localDemo, onLogin, onLogout, onSearch, search = '', unreadCount = 0}: InboxShellProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const go = (url: string) => {navigate(url); setMoreOpen(false); setAccountOpen(false);};
  const links = [
    {url: '/', label: 'Inbox', short: 'Inbox', icon: Inbox, match: path === '/' || path.startsWith('/inbox')},
    {url: '/review', label: 'Needs review', short: 'Review', icon: ShieldCheck, match: path === '/review'},
    {url: '/workspace', label: 'Payments', short: 'Payments', icon: Landmark, match: path === '/workspace' || path.startsWith('/cases') || path === '/payments'},
    {url: '/notifications', label: 'Activity', short: 'Activity', icon: Bell, match: path === '/notifications'},
    {url: '/evidence', label: 'Audit trail', short: 'Audit', icon: FileCheck2, match: path === '/evidence'},
  ];
  const tools = [
    {url: '/operations', label: 'Operations campus', icon: Boxes, description: 'Explore the live finance campus'},
    {url: '/connections', label: 'Connections', icon: PlugZap, description: 'Manage your sources and integrations'},
    {url: '/agents', label: 'Agent activity', icon: Activity, description: 'See recorded agent work'},
    {url: '/business', label: 'Business overview', icon: ChartNoAxesCombined, description: 'Review the business assumptions'},
    {url: '/settings', label: 'Settings', icon: Settings2, description: 'Workspace and technical settings'},
  ];
  const currentPage = path.startsWith('/inbox/') ? 'Message review' : path.startsWith('/cases/') ? 'Payment review' : links.find(link => link.match)?.label || tools.find(tool => tool.url === path)?.label || 'Workspace';
  useEffect(() => {
    if (!accountOpen) return;
    const closeOutside = (event: PointerEvent) => {if (!accountRef.current?.contains(event.target as Node)) setAccountOpen(false);};
    const escape = (event: KeyboardEvent) => {if (event.key === 'Escape') {setAccountOpen(false); accountRef.current?.querySelector('button')?.focus();}};
    document.addEventListener('pointerdown', closeOutside); document.addEventListener('keydown', escape);
    return () => {document.removeEventListener('pointerdown', closeOutside); document.removeEventListener('keydown', escape);};
  }, [accountOpen]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (window.matchMedia('(max-width: 760px)').matches) setSearchOpen(true);
        else document.querySelector<HTMLInputElement>('.sf-search input')?.focus();
      }
    };
    window.addEventListener('keydown', shortcut); return () => window.removeEventListener('keydown', shortcut);
  }, []);

  return <div className="sf-shell">
    <aside className="sf-sidebar sf-floating-rail" aria-label="Workspace navigation">
      <a className="sf-brand sf-rail-brand" href="/" aria-label="SecureFinance home" onClick={event => {event.preventDefault(); go('/');}}><span className="sf-brand-icon"><Leaf size={27} strokeWidth={1.65}/></span><span className="sf-nav-tooltip" aria-hidden="true">SecureFinance</span></a>
      <span className="sf-rail-divider"/>
      <nav aria-label="Primary navigation">{links.map(({url, label, icon: Icon, match}) => <a key={url} href={url} aria-label={label} className={match ? 'is-active' : ''} aria-current={match ? 'page' : undefined} onClick={event => {event.preventDefault(); go(url);}}><Icon size={22} strokeWidth={1.65}/><span className="sf-nav-tooltip" aria-hidden="true">{label}</span>{url === '/notifications' && unreadCount > 0 && <span className="sf-nav-count" aria-hidden="true">{unreadCount > 99 ? '99+' : unreadCount}</span>}</a>)}</nav>
      <span className="sf-rail-divider"/>
      <nav aria-label="Tools">{tools.slice(0, 2).map(({url, label, icon: Icon}) => <a key={url} href={url} aria-label={label} className={path === url ? 'is-active' : ''} aria-current={path === url ? 'page' : undefined} onClick={event => {event.preventDefault(); go(url);}}><Icon size={22} strokeWidth={1.65}/><span className="sf-nav-tooltip" aria-hidden="true">{label}</span></a>)}<button className={moreOpen ? 'is-active' : ''} aria-label="More workspace tools" aria-haspopup="dialog" onClick={() => setMoreOpen(true)}><MoreHorizontal size={23}/><span className="sf-nav-tooltip" aria-hidden="true">More tools</span></button></nav>
      <div className="sf-rail-bottom"><a href="/settings" aria-label="Settings" className={path === '/settings' ? 'is-active' : ''} onClick={event => {event.preventDefault(); go('/settings');}}><Settings2 size={21}/><span className="sf-nav-tooltip" aria-hidden="true">Settings</span></a><button className="sf-rail-account" aria-label={authenticated ? 'Open workspace account' : 'Sign in'} onClick={authenticated ? () => go('/settings') : onLogin}>{authenticated ? 'N' : <ArrowDownLeft size={20}/>}<span className="sf-nav-tooltip" aria-hidden="true">{authenticated ? 'Northstar Labs' : 'Sign in'}</span></button></div>
    </aside>

    <div className="sf-main">
      <header className="sf-topbar">
        <a className="sf-header-brand" href="/" onClick={event => {event.preventDefault(); go('/');}}><span className="sf-mobile-brand-icon"><Leaf size={23}/></span><span>SecureFinance<small>{localDemo ? 'Northstar · Demo workspace' : 'Northstar · Finance workspace'}</small></span></a>
        <span className="sf-topbar-context">{currentPage}</span>
        <label className="sf-search"><Search size={18}/><input value={search} onChange={event => onSearch?.(event.target.value)} onKeyDown={event => {if(event.key === 'Enter'){event.preventDefault();go('/');}}} aria-label="Search your workspace" placeholder="Find a message, invoice or supplier"/><kbd>⌘ K</kbd></label>
        <button className="sf-mobile-search sf-icon-btn" aria-label="Search workspace" aria-haspopup="dialog" onClick={() => setSearchOpen(true)}><Search size={21}/></button>
        <button className="sf-icon-btn sf-notification-button" aria-label="View activity" onClick={() => go('/notifications')}><Bell size={21}/>{unreadCount > 0 && <i/>}</button>
        <div className="sf-account" ref={accountRef}><button className="sf-account-button" aria-label={authenticated ? 'Northstar team account' : 'Sign in to your workspace'} aria-expanded={accountOpen} aria-haspopup={authenticated ? 'menu' : undefined} onClick={authenticated ? () => setAccountOpen(!accountOpen) : onLogin}><span className="sf-account-avatar">{authenticated ? 'NL' : <ArrowDownLeft size={19}/>}</span><span>{authenticated ? 'Northstar team' : 'Sign in'}<small>{authenticated ? 'Workspace member' : 'Open your workspace'}</small></span><ChevronDown size={14}/></button>{accountOpen && <div className="sf-account-menu" role="menu"><span>YOUR WORKSPACE</span><button role="menuitem" onClick={() => go('/settings')}><Settings2 size={16}/>Workspace settings</button>{onLogout && <button role="menuitem" onClick={() => {setAccountOpen(false); onLogout();}}><LogOut size={16}/>Sign out</button>}</div>}</div>
      </header>
      {children}
    </div>

    <nav className="sf-bottom-nav" aria-label="Mobile navigation">{links.slice(0, 4).map(({url, label, short, icon: Icon, match}) => <a key={url} href={url} aria-label={label} className={match ? 'is-active' : ''} aria-current={match ? 'page' : undefined} onClick={event => {event.preventDefault(); go(url);}}><span><Icon size={21} strokeWidth={1.75}/>{url === '/notifications' && unreadCount > 0 && <i/>}</span><small>{short}</small></a>)}<button className={moreOpen ? 'is-active' : ''} onClick={() => setMoreOpen(true)} aria-label="More navigation" aria-haspopup="dialog"><span><MoreHorizontal size={23}/></span><small>More</small></button></nav>

    <Dialog.Root open={moreOpen} onOpenChange={setMoreOpen}><Dialog.Portal><Dialog.Overlay className="sf-more-overlay"/><Dialog.Content className="sf-more-sheet" onCloseAutoFocus={event => {event.preventDefault(); document.querySelector<HTMLButtonElement>(window.matchMedia('(max-width: 760px)').matches ? '.sf-bottom-nav button' : '.sf-floating-rail button[aria-label="More workspace tools"]')?.focus();}}><div className="sf-sheet-handle"/><div className="sf-more-heading"><div><span className="sf-label">NORTHSTAR LABS</span><Dialog.Title>A little more room to explore.</Dialog.Title><Dialog.Description>Your tools, records and workspace settings.</Dialog.Description></div><Dialog.Close className="sf-icon-btn" aria-label="Close navigation"><X size={20}/></Dialog.Close></div><div className="sf-more-links"><a href="/evidence" onClick={event => {event.preventDefault(); go('/evidence');}}><span><FileCheck2 size={21}/></span><div><strong>Audit trail</strong><small>Review the evidence behind a decision</small></div><ArrowUpRight size={16}/></a>{tools.map(({url, label, icon: Icon, description}) => <a key={url} href={url} onClick={event => {event.preventDefault(); go(url);}}><span><Icon size={21}/></span><div><strong>{label}</strong><small>{description}</small></div><ArrowUpRight size={16}/></a>)}</div><div className="sf-more-footer"><ShieldCheck size={17}/><span>{localDemo ? 'Synthetic data. No real funds.' : 'Your decisions stay within your approved policy.'}</span></div></Dialog.Content></Dialog.Portal></Dialog.Root>

    <Dialog.Root open={searchOpen} onOpenChange={setSearchOpen}><Dialog.Portal><Dialog.Overlay className="sf-dialog-overlay"/><Dialog.Content className="sf-dialog sf-search-dialog"><div className="sf-dialog-heading"><div><span className="sf-label">FIND YOUR NEXT STEP</span><Dialog.Title>Search your workspace</Dialog.Title><Dialog.Description>Search inbox subjects, messages and suppliers.</Dialog.Description></div><Dialog.Close className="sf-icon-btn" aria-label="Close search"><X size={20}/></Dialog.Close></div><form onSubmit={event => {event.preventDefault();setSearchOpen(false);go('/');}}><label className="sf-mobile-search-field"><Search size={21}/><input autoFocus value={search} onChange={event => onSearch?.(event.target.value)} aria-label="Search your workspace" placeholder="What are you looking for?"/></label><button className="sf-btn sf-btn-primary" type="submit">Search inbox<ArrowRight size={17}/></button></form></Dialog.Content></Dialog.Portal></Dialog.Root>
  </div>;
}
