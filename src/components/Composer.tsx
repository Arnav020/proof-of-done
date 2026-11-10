import { MagicWand, Storefront } from '@phosphor-icons/react';
import { useState } from 'react';
import { DEMO_BRIEF, DEMO_PRICE } from '../../scripts/demo-data';

export function Composer({ busy, onCompile }: { busy: boolean; onCompile: (brief: string, price: number) => void }) {
  const [brief, setBrief] = useState('');
  const [price, setPrice] = useState(String(DEMO_PRICE));
  const [err, setErr] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const p = Number(price);
    if (brief.trim().length < 20) return setErr('Describe the job in at least a sentence or two.');
    if (!Number.isFinite(p) || p < 50 || p > 10000) return setErr('Price must be between $50 and $10,000.');
    setErr('');
    onCompile(brief.trim(), p);
  };

  return (
    <form className="card composer" onSubmit={submit} noValidate>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h3 className="heading-6">Describe the job</h3>
          <p className="body-6 muted">Write it the way you would message a freelancer. The scope compiler does the rest.</p>
        </div>
        <button type="button" className="btn btn-sm" onClick={() => { setBrief(DEMO_BRIEF); setPrice(String(DEMO_PRICE)); setErr(''); }}>
          <Storefront size={16} /> Load the sample bakery brief
        </button>
      </div>
      <label className="field">
        <span className="title-4">Brief</span>
        <textarea className="textarea" value={brief} onChange={(e) => setBrief(e.target.value)} maxLength={4000} placeholder="Website for my bakery: a homepage with our hours and address, a menu page with prices…" aria-invalid={!!err && brief.trim().length < 20} />
      </label>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'end' }}>
        <label className="field" style={{ width: 200 }}>
          <span className="title-4">Total price (USD)</span>
          <input className="input mono" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
        </label>
        <button className="btn btn-primary" type="submit" disabled={busy}>
          <MagicWand size={18} /> {busy ? 'Compiling scope…' : 'Compile into checkable milestones'}
        </button>
      </div>
      {err && <div className="caption-4 coral" role="alert">{err}</div>}
      {busy && (
        <div className="stack" style={{ gap: 'var(--s-100)' }} aria-live="polite">
          <div className="skeleton" style={{ height: 64 }} />
          <div className="skeleton" style={{ height: 64 }} />
          <div className="skeleton" style={{ height: 64 }} />
        </div>
      )}
    </form>
  );
}
