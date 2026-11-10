import { ArrowDown, CheckCircle, Circle, Lock, ShieldCheck } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { useReveal } from '../hooks';

const RECEIPT = [
  { t: 'Bakery name on the homepage', a: '30.00', ok: true },
  { t: 'Opening hours listed', a: '30.00', ok: true },
  { t: 'Phone number taps to call', a: '30.00', ok: false },
  { t: 'Bread photo above the fold', a: '30.00', ok: true },
  { t: 'Reads cleanly on a phone', a: '60.00', ok: true },
];

function Receipt() {
  const [lit, setLit] = useState(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return setLit(RECEIPT.length + 1);
    const id = setInterval(() => setLit((n) => (n > RECEIPT.length + 2 ? 0 : n + 1)), 900);
    return () => clearInterval(id);
  }, []);
  const done = lit > RECEIPT.length;
  return (
    <div className="receipt" aria-label="Example inspection receipt">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 'var(--s-100)' }}>
        <span className="caption-3 muted">Milestone 1 · Homepage</span>
        <span className="chip ok"><Lock size={12} weight="bold" /> $180.00 held by PayPal</span>
      </div>
      {RECEIPT.map((r, i) => (
        <div key={r.t} className={`receipt-row ${lit > i ? 'on' : ''}`}>
          {lit > i ? (r.ok ? <CheckCircle size={20} weight="fill" className="lime" /> : <Circle size={20} className="coral" />) : <Circle size={20} className="faint" />}
          <span className="body-6">{r.t}</span>
          <span className={`mono body-6 ${lit > i && !r.ok ? 'coral' : ''}`}>${r.a}</span>
        </div>
      ))}
      <div className="receipt-total" style={{ opacity: done ? 1 : 0.35, transition: 'opacity 500ms var(--ease)' }}>
        <div>
          <div className="caption-3 muted">Captured by PayPal</div>
          <div className="mono heading-5 lime">$150.00</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="caption-3 muted">Still held</div>
          <div className="mono heading-5">$30.00</div>
        </div>
      </div>
    </div>
  );
}

function TaglineReveal() {
  const text = 'Nobody should have to trust a stranger with their money. They should be able to check the work.';
  const words = text.split(' ');
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const spans = Array.from(el.querySelectorAll<HTMLSpanElement>('.w'));
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      spans.forEach((s) => s.classList.add('on'));
      return;
    }
    let raf = 0;
    const update = () => {
      raf = 0;
      const trigger = window.innerHeight * 0.62;
      spans.forEach((s) => s.classList.toggle('on', s.getBoundingClientRect().top < trigger));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);
  return (
    <section className="tagline wrap" aria-label="Why Proof of Done">
      <p ref={ref} className="heading-2">
        {words.map((w, i) => (
          <span key={i} className="w">{w}{i < words.length - 1 ? ' ' : ''}</span>
        ))}
      </p>
    </section>
  );
}

function Steps() {
  const ref = useReveal<HTMLDivElement>();
  const steps = [
    { n: '01', t: 'The brief becomes checks', d: 'The client describes the job in plain words. The scope compiler turns it into milestones and testable criteria, each with a price.' },
    { n: '02', t: 'PayPal holds the money', d: 'The client approves a PayPal authorization for each milestone. The freelancer sees the funds are secured. Nobody is charged yet.' },
    { n: '03', t: 'The Inspector decides', d: 'The freelancer submits a link. A headless browser and an AI judge test every criterion, and PayPal captures exactly what passed.' },
  ];
  return (
    <div ref={ref} className="steps wrap reveal">
      {steps.map((s) => (
        <div key={s.n} className="card step">
          <div className="mono title-4 n">{s.n}</div>
          <h3 className="heading-6" style={{ marginTop: 'var(--s-200)' }}>{s.t}</h3>
          <p className="body-6 muted" style={{ marginTop: 'var(--s-75)' }}>{s.d}</p>
        </div>
      ))}
    </div>
  );
}

export function Intro({ onStart }: { onStart: () => void }) {
  return (
    <>
      <header className="hero wrap">
        <div>
          <h1 className="heading-1 gradient-text">
            Pay for work
            <br />
            that is proven done.
          </h1>
          <p className="sub">
            Proof of Done turns a client brief into checks an AI can verify, holds the money with PayPal,
            and releases only the share of the work that passes inspection.
          </p>
          <div className="actions">
            <button className="btn btn-primary" onClick={onStart}>
              Try the sample bakery project <ArrowDown size={18} weight="bold" />
            </button>
            <span className="proof-line caption-4">
              <ShieldCheck size={16} weight="fill" className="lime" /> Live on the PayPal sandbox, every capture ID shown
            </span>
          </div>
        </div>
        <Receipt />
      </header>
      <TaglineReveal />
      <Steps />
    </>
  );
}
