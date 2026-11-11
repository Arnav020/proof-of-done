import { ArrowCounterClockwise, ArrowLeft, ArrowRight, Briefcase, CheckCircle, Code, User, WarningCircle } from '@phosphor-icons/react';
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { api, store, usd, type InspectionReport, type Signed } from './api';
import { Composer, type CompileExtra } from './components/Composer';
import { routeOf } from './route';
import { PENDING_KEY } from './components/FundButton';
import { Intro } from './components/Intro';
import { Guide, nextStep } from './components/Guide';
import { Ledger } from './components/Ledger';
import { MilestonePanel, STATUS } from './components/MilestonePanel';

const Timeline = lazy(() => import('./components/Timeline').then((m) => ({ default: m.Timeline })));
type Role = 'client' | 'freelancer';
type Toast = { kind: 'ok' | 'bad'; text: string } | null;

export default function App() {
  const [signed, setSigned] = useState<Signed | null>(() => store.load());
  const [role, setRole] = useState<Role>('client');
  const [mid, setMid] = useState<string>('m1');
  const [busy, setBusy] = useState<string | null>(null);
  const [reports, setReports] = useState<Record<string, InspectionReport>>({});
  const [toast, setToast] = useState<Toast>(null);
  const [view, setView] = useState<'landing' | 'app'>(() => routeOf(window.location.hash) ?? 'landing');
  const [brandInNav, setBrandInNav] = useState(true);

  useEffect(() => {
    // Only route hashes (#/ and #/app) change the screen; plain anchors such as #how never do.
    const onHash = () => {
      const r = routeOf(window.location.hash);
      if (r) setView(r);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [view]);

  // On the landing page the hero already shows the wordmark and the main button, so the nav shows only the logo
  // until you scroll past the hero's button. Then the name and the button slide into the nav.
  useEffect(() => {
    if (view !== 'landing') return setBrandInNav(true);
    const el = document.querySelector('.hero .actions');
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setBrandInNav(!e.isIntersecting), { rootMargin: '-80px 0px 0px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [view]);
  const go = (v: 'landing' | 'app') => {
    window.location.hash = v === 'app' ? '#/app' : '#/';
    setView(v);
  };

  const update = useCallback((s: Signed | null) => {
    setSigned(s);
    store.save(s);
  }, []);
  const fail = useCallback((text: string) => setToast({ kind: 'bad', text }), []);
  const ok = (text: string) => setToast({ kind: 'ok', text });

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.kind === 'bad' ? 12000 : 9000);
    return () => clearTimeout(t);
  }, [toast]);

  // Return from the PayPal.com redirect fallback: authorize the pending order.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const token = q.get('token');
    const returned = q.get('paypal_return');
    const s = store.load();
    if (!token || !returned || !s) return;
    window.history.replaceState({}, '', `${window.location.pathname}#/app`);
    setView('app');
    const pending = JSON.parse(localStorage.getItem(PENDING_KEY) ?? 'null') as { mid: string; orderId: string } | null;
    if (!pending || pending.orderId !== token) return;
    setBusy('fund');
    api.authorize(s, pending.mid, token)
      .then((n) => { update(n); setMid(pending.mid); ok('PayPal authorization placed. The funds are held, nobody has been charged.'); })
      .catch((e) => fail(e.message))
      .finally(() => { setBusy(null); localStorage.removeItem(PENDING_KEY); });
  }, [update, fail]);

  const compile = async (brief: string, price: number, extra: CompileExtra = {}) => {
    setBusy('compile');
    try {
      const r = await api.compile(brief, price, extra);
      update({ project: r.project, sig: r.sig });
      setMid('m1');
      setReports({});
      ok(`Scope compiled into ${r.project.milestones.length} milestones and ${r.project.milestones.reduce((s, m) => s + m.criteria.length, 0)} checkable criteria.`);
    } catch (e) {
      fail(e instanceof Error ? e.message : 'Compile failed.');
    } finally {
      setBusy(null);
    }
  };

  const onFunded = useCallback((s: Signed) => {
    update(s);
    localStorage.removeItem(PENDING_KEY);
    setToast({ kind: 'ok', text: 'PayPal authorization placed. The funds are held, nobody has been charged.' });
  }, [update]);

  const inspect = async (url: string) => {
    if (!signed) return;
    setBusy('inspect');
    try {
      const r = await api.inspect(signed, mid, url);
      setReports((x) => ({ ...x, [mid]: r.report }));
      let next: Signed = { project: r.project, sig: r.sig };
      update(next);
      setBusy('settle');
      const s = await api.settle(next, mid);
      next = { project: s.project, sig: s.sig };
      update(next);
      const cap = s.capture as { id: string; amount: number; final: boolean } | null;
      if (cap) ok(`PayPal captured ${usd(cap.amount)} for the criteria that passed (capture ${cap.id}${cap.final ? ', final' : ''}).`);
      else if (r.report.injection.flagged) fail('Manipulation attempt detected. Payment for this milestone is frozen until the client reviews each item.');
      else ok('Inspection done. No new criteria passed, so nothing new was captured.');
    } catch (e) {
      fail(e instanceof Error ? e.message : 'Inspection failed.');
    } finally {
      setBusy(null);
    }
  };

  const voidIt = async () => {
    if (!signed) return;
    setBusy('void');
    try {
      update(await api.void(signed, mid));
      ok('Authorization voided. The remaining funds were released and never charged.');
    } catch (e) {
      fail(e instanceof Error ? e.message : 'Void failed.');
    } finally {
      setBusy(null);
    }
  };

  const refund = async (cid: string) => {
    if (!signed) return;
    setBusy('refund');
    try {
      update(await api.refund(signed, mid, cid));
      ok('Refund issued through PayPal.');
    } catch (e) {
      fail(e instanceof Error ? e.message : 'Refund failed.');
    } finally {
      setBusy(null);
    }
  };

  const review = async (cid: string, decision: 'approve' | 'reject') => {
    if (!signed) return;
    setBusy('review');
    try {
      const r = await api.review(signed, mid, cid, decision);
      update({ project: r.project, sig: r.sig });
      if (r.capture) ok(`Approved. PayPal captured ${usd(r.capture.amount)} (capture ${r.capture.id}${r.capture.final ? ', final' : ''}).`);
      else ok(decision === 'approve' ? 'Approved. It will be paid with the rest of the milestone.' : 'Rejected. That amount stays held and is not paid.');
    } catch (e) {
      fail(e instanceof Error ? e.message : 'Review failed.');
    } finally {
      setBusy(null);
    }
  };

  const p = signed?.project;
  const m = p?.milestones.find((x) => x.id === mid) ?? p?.milestones[0];
  const nextMilestone = p && m && m.index < p.milestones.length - 1 ? () => setMid(p.milestones[m.index + 1].id) : null;

  return (
    <>
      <nav className="nav" aria-label="Main">
        <a className="brand" href="#/" onClick={(e) => { e.preventDefault(); go('landing'); }} aria-label="Proof of Done overview">
          <img src="/favicon.svg" width={24} height={24} alt="" />
          <span className={`brand-text ${brandInNav ? '' : 'hidden'}`}>Proof of Done</span>
        </a>
        {view === 'landing' ? (
          <>
            <a className="nav-link body-5" href="#how" onClick={(e) => { e.preventDefault(); document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' }); }}>How it works</a>
            <a className="nav-link body-5" href="https://github.com/Arnav020/proof-of-done" target="_blank" rel="noreferrer">Source</a>
            <button className={`btn btn-primary btn-sm nav-cta ${brandInNav ? '' : 'hidden'}`} onClick={() => go('app')} tabIndex={brandInNav ? 0 : -1} aria-hidden={!brandInNav}>{p ? 'Continue project' : 'Open the app'} <ArrowRight size={14} weight="bold" /></button>
          </>
        ) : (
          <>
            {p && (
              <div className="role" role="group" aria-label="View as">
                <button aria-pressed={role === 'client'} onClick={() => setRole('client')}><Briefcase size={14} /> Client</button>
                <button aria-pressed={role === 'freelancer'} onClick={() => setRole('freelancer')}><User size={14} /> Freelancer</button>
              </div>
            )}
            <a className="btn btn-ghost btn-sm" href="https://github.com/Arnav020/proof-of-done" target="_blank" rel="noreferrer" aria-label="Source code">
              <Code size={18} /> <span className="nav-src">Source</span>
            </a>
          </>
        )}
      </nav>

      {view === 'landing' && <Intro onStart={() => go('app')} hasProject={!!p} />}

      {view === 'app' && (
      <main id="workspace" className="workspace">
        <div className="wrap">
          <button className="btn btn-ghost btn-sm back" onClick={() => go('landing')}><ArrowLeft size={14} /> Overview</button>
          <div className="ws-head">
            <div>
              <div className="caption-3 lime">Live workspace · PayPal sandbox</div>
              <h2 className="heading-3" style={{ marginTop: 'var(--s-75)' }}>{p ? p.title : 'Start a project'}</h2>
              <p className="body-6 muted" style={{ marginTop: 'var(--s-75)' }}>
                {p
                  ? `${p.clientName} hires ${p.freelancerName} for ${usd(p.total)}.`
                  : 'You play both sides. As the client you write the brief and fund milestones with PayPal; as the freelancer you submit work.'}
              </p>
              {p && (
                <p className="body-6" style={{ marginTop: 'var(--s-50)' }}>
                  <span className="lime">Viewing as {role === 'client' ? 'Client' : 'Freelancer'}:</span>{' '}
                  <span className="muted">
                    {role === 'client'
                      ? 'you fund milestones with PayPal, review anything the Inspector holds, and can void or dispute.'
                      : 'you submit links to delivered work and get paid for every criterion that passes.'}
                    {' '}Switch sides in the top bar.
                  </span>
                </p>
              )}
            </div>
            {p && (
              <button className="btn btn-sm" onClick={() => { update(null); setReports({}); }}>
                <ArrowCounterClockwise size={14} /> New project
              </button>
            )}
          </div>

          {!p ? (
            <Composer busy={busy === 'compile'} onCompile={compile} />
          ) : (
            <div className="stack">
              {m &&<Guide step={nextStep(m, role, p.milestones.length, setRole, nextMilestone)} />}
              <div className="section-label">
                <span className="title-4">Milestones</span>
                <span className="caption-5 muted">Each milestone has its own PayPal hold. Select one to work on it.</span>
              </div>
              <div className="ms-tabs" role="tablist" aria-label="Milestones">
                {p.milestones.map((x) => (
                  <button key={x.id} role="tab" aria-selected={x.id === m?.id} className="ms-tab" onClick={() => setMid(x.id)}>
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <span className="caption-3 muted">Milestone {x.index + 1}</span>
                      <span className={`chip ${STATUS[x.status].cls}`}>{STATUS[x.status].label}</span>
                    </div>
                    <span className="title-3">{x.title}</span>
                    <div className="bar"><span style={{ transform: `scaleX(${x.payment.captured / x.amount})` }} /></div>
                    <span className="mono caption-4 muted">{usd(x.payment.captured)} of {usd(x.amount)} captured</span>
                  </button>
                ))}
              </div>
              <div className="section-label">
                <span className="title-4">Timeline</span>
                <span className="caption-5 muted">Bars fill as PayPal captures money. A milestone that is not paid holds back the next one.</span>
              </div>
              <Suspense fallback={<div className="skeleton gantt-box" />}>
                <Timeline project={p} />
              </Suspense>
              <div className="grid-2">
                {m && signed && (
                  <MilestonePanel
                    key={m.id}
                    signed={signed}
                    m={m}
                    role={role}
                    report={reports[m.id]}
                    busy={busy}
                    demoBase={window.location.origin}
                    onFunded={onFunded}
                    onInspect={inspect}
                    onVoid={voidIt}
                    onRefund={refund}
                    onReview={review}
                    onError={fail}
                  />
                )}
                <Ledger project={p} />
              </div>
            </div>
          )}
        </div>
      </main>
      )}

      <footer className="site wrap">
        <span className="caption-5 muted">Proof of Done runs on the PayPal sandbox. No real money moves. Demo businesses are fictional.</span>
        <span className="caption-5 muted">MIT licensed · <a href="https://github.com/Arnav020/proof-of-done">Source</a> · <a href="https://github.com/Arnav020/proof-of-done/blob/main/ARCHITECTURE.md">Architecture</a></span>
      </footer>

      {toast && (
        <div role="status" aria-live="polite" className={`alert ${toast.kind === 'ok' ? 'ok' : 'bad'}`} style={{ position: 'fixed', right: 'var(--s-200)', bottom: 'var(--s-200)', maxWidth: 420, background: 'var(--surface)', zIndex: 60 }}>
          {toast.kind === 'ok' ? <CheckCircle size={22} weight="fill" className="lime" /> : <WarningCircle size={22} weight="fill" className="coral" />}
          <div className="body-6">{toast.text}</div>
        </div>
      )}
    </>
  );
}
