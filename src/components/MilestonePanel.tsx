import { ArrowCounterClockwise, CheckCircle, Clock, Code, HourglassMedium, Link, Prohibit, Sparkle, XCircle } from '@phosphor-icons/react';
import { useState } from 'react';
import { usd, type InspectionReport, type Project, type Signed } from '../api';
import { FundButton } from './FundButton';
import { Report } from './Report';

type Role = 'client' | 'freelancer';
type M = Project['milestones'][number];

export const STATUS: Record<M['status'], { label: string; cls: string }> = {
  awaiting_funding: { label: 'Awaiting funding', cls: 'idle' },
  funded: { label: 'Funds held', cls: 'ok' },
  in_review: { label: 'In review', cls: 'warn' },
  partially_paid: { label: 'Partially paid', cls: 'ok' },
  paid: { label: 'Paid in full', cls: 'ok' },
  voided: { label: 'Voided', cls: 'bad' },
};

function CritIcon({ c }: { c: M['criteria'][number] }) {
  if (c.refunded) return <ArrowCounterClockwise size={22} className="amber" />;
  if (!c.verdict) return <HourglassMedium size={22} className="faint" />;
  if (c.verdict.needsReview) return <Clock size={22} className="amber" />;
  return c.verdict.pass ? <CheckCircle size={22} weight="fill" className="lime" /> : <XCircle size={22} weight="fill" className="coral" />;
}

type Props = {
  signed: Signed;
  m: M;
  role: Role;
  report?: InspectionReport;
  busy: string | null;
  demoBase: string;
  onFunded: (s: Signed) => void;
  onInspect: (url: string) => void;
  onVoid: () => void;
  onRefund: (cid: string) => void;
  onError: (msg: string) => void;
};

export function MilestonePanel({ signed, m, role, report, busy, demoBase, onFunded, onInspect, onVoid, onRefund, onError }: Props) {
  const [url, setUrl] = useState('');
  const st = STATUS[m.status];
  const open = m.status !== 'voided' && m.status !== 'paid';
  const funded = !!m.payment.authorizationId;
  const samples =
    m.index === 0
      ? [{ label: 'First draft', path: '/demo-sites/larkhill-v1/index.html' }, { label: 'Fixed version', path: '/demo-sites/larkhill-v2/index.html' }]
      : m.index === 1
        ? [{ label: 'Menu page', path: '/demo-sites/larkhill-menu/index.html' }]
        : [];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^https?:\/\/.+/i.test(url.trim())) return onError('Enter a full link starting with https://');
    onInspect(url.trim());
  };

  return (
    <section className="card panel" aria-label={`Milestone ${m.index + 1}`}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'start' }}>
        <div>
          <div className="caption-3 muted">Milestone {m.index + 1} · due {new Date(m.dueAt).toLocaleDateString()}</div>
          <h3 className="heading-5" style={{ marginTop: 'var(--s-50)' }}>{m.title}</h3>
          <p className="body-6 muted" style={{ marginTop: 'var(--s-50)' }}>{m.summary}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="mono heading-5">{usd(m.amount)}</div>
          <span className={`chip ${st.cls}`}>{st.label}</span>
        </div>
      </div>

      <div className="stack" style={{ gap: 'var(--s-100)' }}>
        {m.criteria.map((c) => (
          <div key={c.id} className="crit">
            <CritIcon c={c} />
            <div>
              <div className="row" style={{ gap: 'var(--s-75)' }}>
                <span className="title-4">{c.title}</span>
                <span className="chip idle">{c.kind === 'deterministic' ? <><Code size={12} /> code check</> : <><Sparkle size={12} /> AI {c.kind}</>}</span>
                {c.paid && !c.refunded && <span className="chip ok">paid</span>}
                {c.refunded && <span className="chip warn">refunded</span>}
              </div>
              <div className="body-6 muted">{c.description}</div>
              {c.verdict && (
                <div className={`ev caption-4 ${c.verdict.needsReview ? 'amber' : c.verdict.pass ? 'lime' : 'coral'}`}>
                  {c.verdict.evidence}
                  {c.verdict.source === 'ai' && <span className="faint"> · confidence {c.verdict.confidence.toFixed(2)}</span>}
                </div>
              )}
              {role === 'client' && c.paid && !c.refunded && (
                <button className="btn btn-ghost btn-sm" style={{ marginTop: 'var(--s-75)' }} disabled={!!busy} onClick={() => onRefund(c.id)}>
                  <ArrowCounterClockwise size={14} /> Dispute and refund {usd(c.amount)}
                </button>
              )}
            </div>
            <span className="mono body-6">{usd(c.amount)}</span>
          </div>
        ))}
      </div>

      {role === 'client' && !funded && m.status !== 'voided' && (
        <FundButton signed={signed} mid={m.id} amount={m.amount} onFunded={onFunded} onError={onError} />
      )}

      {role === 'client' && funded && open && (
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="caption-5 muted">
            Authorization <span className="mono">{m.payment.authorizationId}</span> holds {usd((m.payment.authorizedAmount ?? 0) - m.payment.captured)}.
          </span>
          <button className="btn btn-sm btn-danger" disabled={!!busy} onClick={onVoid}>
            <Prohibit size={14} /> Deadline passed: void and release
          </button>
        </div>
      )}

      {role === 'freelancer' && (
        funded ? (
          open ? (
            <form className="stack" style={{ gap: 'var(--s-100)' }} onSubmit={submit}>
              <label className="field">
                <span className="title-4">Submit your delivery</span>
                <span className="caption-5 muted">The AI Inspector tests it now. Whatever passes is captured from the PayPal authorization immediately.</span>
                <div className="row" style={{ flexWrap: 'nowrap' }}>
                  <input className="input mono" type="url" required placeholder="https://your-delivered-site.example" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Delivered page URL" />
                  <button className="btn btn-primary" disabled={!!busy} type="submit">
                    {busy === 'inspect' ? 'Inspecting…' : 'Inspect and get paid'}
                  </button>
                </div>
              </label>
              {samples.length > 0 && (
                <div className="row" style={{ gap: 'var(--s-75)' }}>
                  <span className="caption-4 faint"><Link size={12} /> Demo deliveries:</span>
                  {samples.map((s) => (
                    <button key={s.path} type="button" className="btn btn-sm btn-ghost" onClick={() => setUrl(demoBase + s.path)}>{s.label}</button>
                  ))}
                </div>
              )}
            </form>
          ) : (
            <div className="alert ok"><CheckCircle size={20} className="lime" /><div className="body-6">This milestone is closed ({st.label.toLowerCase()}).</div></div>
          )
        ) : (
          <div className="alert warn"><Clock size={20} className="amber" /><div className="body-6">Waiting for the client to secure this milestone with PayPal. Start work once the funds are held.</div></div>
        )
      )}

      {busy === 'inspect' && (
        <div className="stack" style={{ gap: 'var(--s-100)' }} aria-live="polite">
          <div className="caption-4 muted">Opening the page in headless Chrome, scanning for hidden instructions, running code checks, then asking the AI judge. This usually takes 10 to 30 seconds.</div>
          <div className="skeleton" style={{ height: 20 }} />
          <div className="skeleton" style={{ height: 20, width: '80%' }} />
          <div className="skeleton" style={{ height: 180 }} />
        </div>
      )}
      {report && busy !== 'inspect' && <Report r={report} />}
    </section>
  );
}
