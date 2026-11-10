import { ArrowCounterClockwise, CheckCircle, Lock, MagnifyingGlass, Prohibit, Sparkle, Warning } from '@phosphor-icons/react';
import { useState } from 'react';
import { api, usd, type Project } from '../api';

const ICON = {
  created: <Sparkle size={18} className="muted" />,
  authorized: <Lock size={18} className="lime" />,
  inspected: <MagnifyingGlass size={18} className="muted" />,
  flagged: <Warning size={18} className="coral" />,
  captured: <CheckCircle size={18} weight="fill" className="lime" />,
  refunded: <ArrowCounterClockwise size={18} className="amber" />,
  voided: <Prohibit size={18} className="amber" />,
} as const;

export function Ledger({ project }: { project: Project }) {
  const [verify, setVerify] = useState<Record<string, string>>({});
  const totals = project.milestones.reduce(
    (a, m) => {
      a.held += m.payment.authorizationId && m.status !== 'voided' ? (m.payment.authorizedAmount ?? 0) - m.payment.captured : 0;
      a.captured += m.payment.captured;
      a.fees += m.payment.captures.reduce((s, c) => s + (c.fee ?? 0), 0);
      a.refunded += m.payment.refunds.reduce((s, r) => s + r.amount, 0);
      return a;
    },
    { held: 0, captured: 0, fees: 0, refunded: 0 },
  );

  const check = async (orderId: string) => {
    setVerify((v) => ({ ...v, [orderId]: 'Checking with PayPal…' }));
    try {
      const o = await api.verifyOrder(orderId);
      const a = o.authorizations[0];
      setVerify((v) => ({ ...v, [orderId]: `PayPal says: order ${o.status}, authorization ${a?.status ?? 'none'}, ${o.captures.length} capture(s) totalling $${o.captures.reduce((s, c) => s + Number(c.amount), 0).toFixed(2)}` }));
    } catch (e) {
      setVerify((v) => ({ ...v, [orderId]: e instanceof Error ? e.message : 'Could not reach PayPal.' }));
    }
  };

  const events = [...project.events].reverse();
  return (
    <aside className="card ledger" aria-label="PayPal money ledger">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3 className="heading-6">Money ledger</h3>
        <span className="chip idle mono">PayPal sandbox</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--s-100)' }}>
        <div><div className="caption-3 muted">Held</div><div className="mono title-2">{usd(totals.held)}</div></div>
        <div><div className="caption-3 muted">Captured</div><div className="mono title-2 lime">{usd(totals.captured)}</div></div>
        <div><div className="caption-3 muted">PayPal fees</div><div className="mono title-2">{usd(totals.fees)}</div></div>
      </div>
      <div className="stack" style={{ gap: 'var(--s-200)' }}>
        {events.map((e, i) => {
          const m = project.milestones.find((x) => x.id === e.milestoneId);
          const cap = e.type === 'captured' ? m?.payment.captures.find((c) => c.id === e.paypalId) : undefined;
          return (
            <div key={i} className="ev-row">
              {ICON[e.type]}
              <div>
                <div className="body-6">{e.note}</div>
                <div className="ids">
                  {m && <span className="chip idle">{m.title}</span>}
                  {e.amount !== undefined && <span className="chip idle mono">{usd(e.amount)}</span>}
                  {e.paypalId && <span className="chip idle mono" title="PayPal ID">{e.paypalId}</span>}
                  {e.status && <span className={`chip mono ${e.type === 'captured' || e.type === 'authorized' ? 'ok' : 'warn'}`}>{e.status}</span>}
                  {cap?.fee !== undefined && <span className="chip idle mono">fee {usd(cap.fee)} · net {usd(cap.net ?? 0)}</span>}
                </div>
                <div className="caption-5 faint" style={{ marginTop: 'var(--s-50)' }}>{new Date(e.at).toLocaleString()}</div>
              </div>
            </div>
          );
        })}
      </div>
      {project.milestones.filter((m) => m.payment.orderId).map((m) => (
        <div key={m.id} className="stack" style={{ gap: 'var(--s-50)' }}>
          <button className="btn btn-sm" onClick={() => check(m.payment.orderId!)}>
            <MagnifyingGlass size={14} /> Verify {m.title} with PayPal
          </button>
          {verify[m.payment.orderId!] && <div className="caption-5 muted">{verify[m.payment.orderId!]}</div>}
        </div>
      ))}
    </aside>
  );
}
