import React, { useState, useEffect, useCallback, type FormEvent, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { api, money, day, go, paths, type Row, setCSRF } from './lib/api';
import { BusinessLogo, Button, Field, Input, Badge, Status, Empty, Modal, ErrorBox, useData, Load, PageHead, Chart, Totals, Preview, Icon } from './components/ui';
import { Auth } from './features/auth';
import { Dashboard } from './features/dashboard';
import {Editor} from './features/billing';
import {Documents} from './features/document-list';
import {InvoiceManagement} from './features/invoice-management';
import {CatalogueManagement} from './features/catalogue-management';
import {CompanyAccounts} from './features/accounts';
import { Directory } from './features/records';
import { Settings, Team, Backups, Activity } from './features/admin';
import { Payments, Expenses, Reports } from './features/money';
function App() {
    const [session, setSession] = useState<any>(null), [bootError, setBootError] = useState(''), [hash, setHash] = useState(location.hash.slice(1) || 'dashboard'), [mobile, setMobile] = useState(false), [toast, setToast] = useState(''), [quick, setQuick] = useState(false);
    const refreshSession = async () => { try {
        const s = await api('/session');
        setCSRF(s.csrf || '');
        setSession(s);
    }
    catch (e: any) {
        setBootError(e.message);
    } };
    useEffect(() => { refreshSession(); const h = () => { setHash(location.hash.slice(1) || 'dashboard'); setMobile(false); }; window.addEventListener('hashchange', h); return () => window.removeEventListener('hashchange', h); }, []);
    useEffect(() => { if (toast) {
        const t = setTimeout(() => setToast(''), 4500);
        return () => clearTimeout(t);
    } }, [toast]);
    useEffect(() => { const k = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setQuick(v => !v);
    } }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);
    useEffect(()=>{window.scrollTo({top:0,behavior:'instant'});},[hash.split('?')[0],new URLSearchParams(hash.split('?')[1]).get('id')]);
    if (bootError)
        return <div className="auth-card"><ErrorBox error={bootError}/><Button onClick={() => location.reload()}>Retry</Button></div>;
    if (!session)
        return <div className="loading">Opening workspace…</div>;
    if (!session.user)
        return <Auth session={session} onDone={refreshSession}/>;
    const user = session.user, manager = user.role === 'manager', page = hash.split('?')[0], params = new URLSearchParams(hash.split('?')[1]), notify = (s: string) => setToast(s);
    const nav = (key: string, icon: string, label?: string) => <button key={key + (label || '')} className={`nav-item ${page === key.split('?')[0] && (key.includes('?') ? hash === key : !params.get('filter')) ? 'active' : ''}`} onClick={() => go(key)}><Icon name={icon} size={19}/><span>{label || paths[key]}</span>{key === 'invoices' && <span className="nav-shortcut">I</span>}</button>;
    const common = { user, notify };
    return <div className="app"><a className="skip-link" href="#main">Skip to content</a>{mobile && <div className="sidebar-scrim" onClick={() => setMobile(false)}/>}<aside className={`sidebar ${mobile ? 'open' : ''}`}><div className="brand"><span className="brand-mark"><Icon name="leaf" size={24}/></span><div>Billing<span className="brand-dot">.</span><small>BUSINESS WORKSPACE</small></div></div><div className="business-switch"><BusinessLogo logoId={session.branding?.logoId} name={session.business?.name} className="business-avatar company-logo"/><div><strong>{session.business?.name || 'Your business'}</strong><small>{session.business ? 'Billing workspace' : 'Setup required'}</small></div><Icon name="down" size={15}/></div><nav aria-label="Main navigation">{nav('dashboard','grid')}<details className="nav-group" open={['invoices','quotations','proformas','editor'].includes(page)}><summary>Sales</summary>{nav('invoices','file')}{nav('quotations','file')}{nav('proformas','file')}</details><details className="nav-group" open={['customers','products','services'].includes(page)}><summary>Masters</summary>{nav('customers','users')}{nav('products','box')}{nav('services','file')}</details><details className="nav-group" open={['payments','expenses','accounts'].includes(page)}><summary>Financials</summary>{nav('payments','wallet')}{manager&&nav('expenses','wallet')}{manager&&nav('accounts','users')}</details>{manager&&<>{nav('reports','chart')}<details className="nav-group" open={['team','backups','settings','activity'].includes(page)}><summary>Administration</summary>{nav('team','users')}{nav('backups','shield')}{nav('settings','settings')}{nav('activity','clock')}</details></>}</nav><div className="sidebar-bottom"><div className="connection"><span />Connected to local server</div><button className="profile" onClick={async () => { await api('/logout', 'POST'); setSession({ ...session, user: null }); }} title="Sign out"><div className="avatar">{user.name.slice(0, 1).toUpperCase()}</div><div><strong>{user.name}</strong><small>{manager ? 'Manager' : 'Staff'} account</small></div><Icon name="logout" size={18}/></button></div></aside><div className="workspace"><header className="topbar"><button className="icon-button mobile-menu" aria-label="Open menu" onClick={() => setMobile(true)}><Icon name="menu"/></button><div className="breadcrumb">Workspace <span>/</span> <strong>{paths[page] || 'Invoice editor'}</strong></div><div className="topbar-right"><button className="command" onClick={() => setQuick(true)}><Icon name="search" size={16}/><span>Jump to…</span><kbd>Ctrl K</kbd></button><span className="today">{new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}</span><div className="avatar small">{user.name.slice(0, 1).toUpperCase()}</div></div></header><main id="main" tabIndex={-1}>{!session.business && page !== 'settings' && <div className="setup-banner"><Icon name="alert" size={18}/><span>{manager ? 'Complete business setup before issuing invoices.' : 'Your manager needs to complete business setup before issuing.'}</span>{manager && <button onClick={() => go('settings')}>Set up business <Icon name="arrow" size={15}/></button>}</div>}{page === 'dashboard' ? <Dashboard {...common}/> : page === 'invoices' ? <InvoiceManagement {...common} params={params}/> : page === 'quotations' || page === 'proformas' ? <Documents {...common} kind={page==='proformas'?'proforma':'quote'} params={params}/> : page === 'editor' ? <Editor key={(params.get('id')||'new')+(params.get('kind')||'invoice')} {...common} id={params.get('id')} kind={params.get('kind') || 'invoice'}/> : page === 'customers' ? <Directory {...common} kind={page}/> : page==='products'||page==='services'?<CatalogueManagement key={page} {...common} type={page==='products'?'product':'service'} params={params}/> : page==='accounts'?<CompanyAccounts {...common} params={params}/> : page === 'payments' ? <Payments {...common}/> : page === 'settings' ? <Settings {...common} onSaved={refreshSession}/> : page === 'team' ? <Team {...common}/> : page === 'expenses' ? <Expenses {...common}/> : page === 'reports' ? <Reports {...common}/> : page === 'backups' ? <Backups {...common}/> : page === 'activity' ? <Activity {...common}/> : <Empty title="Page not found" action={<Button onClick={() => go('dashboard')}>Back to overview</Button>}/>}</main><footer className="workspace-footer"><span>Billing Workspace <span className="muted">/</span> Made for your everyday.</span><span>INR · Asia/Kolkata</span></footer></div>{toast && <div className="toast" role="status"><Icon name="check" size={18}/>{toast}</div>}{quick && <QuickJump onClose={() => setQuick(false)} manager={manager}/>}</div>;
}
function QuickJump({ onClose, manager }: any) { const [q, setQ] = useState(''); return <Modal title="Go to workspace" onClose={onClose}><Input label="Find a page" autoFocus placeholder="Invoices, customers, payments…" value={q} onChange={(e: any) => setQ(e.target.value)}/><div className="quick-list">{Object.entries(paths).filter(([key, title]) => (manager || !['reports', 'team', 'backups', 'settings', 'activity', 'expenses','accounts'].includes(key)) && title.toLowerCase().includes(q.toLowerCase())).map(([key, title]) => <button key={key} onClick={() => { go(key); onClose(); }}>{title}<Icon name="arrow" size={16}/></button>)}</div></Modal>; }
createRoot(document.getElementById('root')!).render(<App />);
