import React, { useState, useEffect, useCallback, type FormEvent, type ReactNode } from 'react';
import { api, money, day, go, paths, type Row } from '../lib/api';
import { Button, Field, Input, Badge, Status, Empty, Modal, ErrorBox, useData, Load, PageHead, Chart, Totals, Preview, Icon } from '../components/ui';
export function Auth({ session, onDone }: any) { const setup = session.needsSetup, [error, setError] = useState(''), [busy, setBusy] = useState(false); async function submit(e: FormEvent<HTMLFormElement>) { e.preventDefault(); setBusy(true); setError(''); try {
    const b = Object.fromEntries(new FormData(e.currentTarget));
    await api(setup ? '/setup' : '/login', 'POST', b);
    await onDone();
}
catch (e: any) {
    setError(e.message);
}
finally {
    setBusy(false);
} } return <div className="auth"><div className="auth-story"><div className="brand"><span className="brand-mark"><Icon name="leaf" size={26}/></span>Billing Workspace<span className="brand-dot">.</span></div><div><span className="eyebrow light">A LITTLE CLARITY, EVERY DAY</span><h1>Good business.<br />Clear books.</h1><p>Your customers, invoices and collections.<br />One calm place to keep everything moving.</p><div className="auth-line"/><span className="auth-caption">Built for the way service businesses work.</span></div><small>TEAL & IVORY / BUSINESS WORKSPACE</small></div><div className="auth-form"><div className="auth-card"><div className="small-logo"><Icon name="leaf"/></div><span className="eyebrow">LET’S GET TO WORK</span><h2>{setup ? 'Make this workspace yours.' : 'Welcome back.'}</h2><p>{setup ? 'Create your manager login. Add your business details and two staff accounts next.' : 'Sign in to manage your daily business.'}</p><form onSubmit={submit}>{setup && <Input label="Your name" name="name" required autoComplete="name"/>}<Input label="Email address" name="email" type="email" required autoComplete="username"/><Input label="Password" name="password" type="password" required minLength={setup ? 12 : 1} maxLength={128} autoComplete={setup ? 'new-password' : 'current-password'} hint={setup ? 'At least 12 characters. No default or shared passwords.' : undefined}/><ErrorBox error={error}/><Button type="submit" disabled={busy}>{busy ? 'Please wait…' : setup ? 'Create manager account' : 'Sign in'}<Icon name="arrow" size={17}/></Button></form><div className="auth-note"><Icon name="shield" size={16}/>{setup ? 'Private local setup · No sample financial records' : 'Separate accounts. Permissions enforced on the server.'}</div></div></div></div>; }
