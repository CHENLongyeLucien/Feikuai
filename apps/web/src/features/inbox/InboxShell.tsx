import {useEffect, useRef, useState, type ReactNode} from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {Activity, ArrowDownLeft, ArrowRight, Bell, Boxes, ChartNoAxesCombined, ChevronDown, FileCheck2, Inbox, Landmark, Leaf, LogOut, Search, Settings2, X} from 'lucide-react';
import './inbox.css';

export type InboxShellProps = {
  children: ReactNode; path: string; navigate: (path: string) => void;
  authenticated: boolean; localDemo?: boolean; onLogin: () => void;
  onLogout?: () => void; onSearch?: (query: string) => void; search?: string;
  unreadCount?: number; onNew?: () => void;
};

export function InboxShell({children, path, navigate, authenticated, localDemo, onLogin, onLogout, onSearch, search = '', unreadCount = 0}: InboxShellProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const go = (url: string) => {navigate(url); setAccountOpen(false);};
  const links = [
    {url: '/', label: 'Inbox', short: 'Inbox', icon: Inbox, match: path === '/' || path.startsWith('/inbox')},
    {url: '/workspace', label: 'Payments', short: 'Payments', icon: Landmark, match: path === '/workspace' || path.startsWith('/cases') || path === '/payments'},
    {url: '/notifications', label: 'Alerts', short: 'Alerts', icon: Bell, match: path === '/notifications'},
    {url: '/evidence', label: 'History & reports', short: 'Reports', icon: FileCheck2, match: path === '/evidence'},
  ];
  const tools = [
    {url: '/operations', label: 'Operations campus', short: 'Campus', icon: Boxes},
    {url: '/agents', label: 'Agents', short: 'Agents', icon: Activity},
    {url: '/business', label: 'Business overview', short: 'Business', icon: ChartNoAxesCombined},
    {url: '/settings', label: 'Settings', short: 'Settings', icon: Settings2},
  ];
  const destinations = [...links, ...tools.map(tool => ({...tool, match: path === tool.url}))];
  const currentPage = path.startsWith('/inbox/') ? 'Message review' : path.startsWith('/cases/') ? 'Payment review' : destinations.find(link => link.match)?.label || 'Workspace';
  const navigationLinks = destinations.map(({url, label, short, icon: Icon, match}) => <a key={url} href={url} aria-label={label} title={label} className={match ? 'is-active' : ''} aria-current={match ? 'page' : undefined} onClick={event => {event.preventDefault(); go(url);}}><span className="sf-nav-icon"><Icon size={21} strokeWidth={1.75}/>{url === '/notifications' && unreadCount > 0 && <span className="sf-nav-count" aria-hidden="true">{unreadCount > 99 ? '99+' : unreadCount}</span>}</span><small>{short}</small></a>);
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
      <a className="sf-brand sf-rail-brand" href="/" aria-label="SecureFinance home" onClick={event => {event.preventDefault(); go('/');}}><span className="sf-brand-icon"><Leaf size={27} strokeWidth={1.65}/></span></a>
      <span className="sf-rail-divider"/>
      <nav aria-label="Primary navigation">{navigationLinks}</nav>
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
      <nav className="sf-mobile-nav" aria-label="Mobile navigation">{navigationLinks}</nav>
      {children}
    </div>

    <Dialog.Root open={searchOpen} onOpenChange={setSearchOpen}><Dialog.Portal><Dialog.Overlay className="sf-dialog-overlay"/><Dialog.Content className="sf-dialog sf-search-dialog"><div className="sf-dialog-heading"><div><span className="sf-label">FIND YOUR NEXT STEP</span><Dialog.Title>Search your workspace</Dialog.Title><Dialog.Description>Search inbox subjects, messages and suppliers.</Dialog.Description></div><Dialog.Close className="sf-icon-btn" aria-label="Close search"><X size={20}/></Dialog.Close></div><form onSubmit={event => {event.preventDefault();setSearchOpen(false);go('/');}}><label className="sf-mobile-search-field"><Search size={21}/><input autoFocus value={search} onChange={event => onSearch?.(event.target.value)} aria-label="Search your workspace" placeholder="What are you looking for?"/></label><button className="sf-btn sf-btn-primary" type="submit">Search inbox<ArrowRight size={17}/></button></form></Dialog.Content></Dialog.Portal></Dialog.Root>
  </div>;
}
