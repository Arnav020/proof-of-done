import { HandHeart, MagicWand, Storefront } from '@phosphor-icons/react';
import { useState, type ReactElement } from 'react';
import { DEMO_PRICE, SAMPLES, type Sample } from '../../scripts/demo-data';

export type CompileExtra = { clientName?: string; freelancerName?: string; sampleId?: string };

const ICON: Record<Sample['id'], ReactElement> = {
  bakery: <Storefront size={20} />,
  foodbank: <HandHeart size={20} />,
};

export function Composer({ busy, onCompile }: { busy: boolean; onCompile: (brief: string, price: number, extra: CompileExtra) => void }) {
  const [brief, setBrief] = useState('');
  const [price, setPrice] = useState(String(DEMO_PRICE));
  const [picked, setPicked] = useState<Sample | null>(null);
  const [err, setErr] = useState('');

  const load = (s: Sample) => {
    setPicked(s);
    setBrief(s.brief);
    setPrice(String(s.price));
    setErr('');
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const p = Number(price);
    if (brief.trim().length < 20) return setErr('Describe the job in at least a sentence or two, or pick a sample above.');
    if (!Number.isFinite(p) || p < 50 || p > 10000) return setErr('Price must be between $50 and $10,000.');
    setErr('');
    // A sample counts as a sample only while its brief is unedited, so its demo deliveries still match.
    const sample = picked && brief.trim() === picked.brief.trim() ? picked : null;
    onCompile(brief.trim(), p, sample ? { clientName: sample.clientName, freelancerName: sample.freelancerName, sampleId: sample.id } : {});
  };

  return (
    <form className="card composer" onSubmit={submit} noValidate>
      <div>
        <h3 className="heading-6">Start from a sample, or describe your own job</h3>
        <p className="body-6 muted">Each sample comes with demo deliveries, so you can run the whole flow in a couple of minutes.</p>
      </div>
      <div className="sample-cards" role="radiogroup" aria-label="Sample projects">
        {SAMPLES.map((s) => (
          <button key={s.id} type="button" role="radio" aria-checked={picked?.id === s.id} className="sample-card" onClick={() => load(s)}>
            <span className="row" style={{ justifyContent: 'space-between' }}>
              <span className="row" style={{ gap: 'var(--s-75)' }}>{ICON[s.id]}<span className="title-3">{s.title}</span></span>
              <span className="chip idle">{s.audience}</span>
            </span>
            <span className="caption-5 muted">{s.story}</span>
            <span className="mono caption-4 faint">${s.price.toLocaleString('en-US')} · {s.deliveries.length} deliverables · {s.clientName}</span>
          </button>
        ))}
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
