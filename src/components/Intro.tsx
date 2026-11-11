import { ArrowRight, CheckCircle, Circle, Code, Lock, ShieldCheck, Sparkle, XCircle } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
// Only the summary object is imported, so the hero can never drift from the committed evaluation.
import { results } from '../../results/metrics.json';

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Fires once when the element enters the viewport. */
function useInView<T extends HTMLElement>(threshold = 0.35) {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        setSeen(true);
        io.disconnect();
      }
    }, { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return [ref, seen] as const;
}

/** Types text out once it is visible; shows it whole under reduced motion. */
function TypeText({ text, start, delay = 0, className }: { text: string; start: boolean; delay?: number; className?: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!start) return;
    if (reduced()) return setN(text.length);
    let i = 0;
    let id: number | undefined;
    const t = window.setTimeout(() => {
      id = window.setInterval(() => {
        i += 2;
        setN(Math.min(i, text.length));
        if (i >= text.length) window.clearInterval(id);
      }, 18);
    }, delay);
    return () => {
      window.clearTimeout(t);
      if (id) window.clearInterval(id);
    };
  }, [start, text, delay]);
  return (
    <p className={className} aria-label={text}>
      <span aria-hidden="true">{text.slice(0, n)}</span>
      {start && n < text.length && <span className="caret" aria-hidden="true" />}
      <span aria-hidden="true" style={{ visibility: 'hidden' }}>{text.slice(n)}</span>
    </p>
  );
}

/** Real, measured numbers (results/metrics.json) instead of decoration. */
function ProofStrip() {
  const r = results;
  const stats = [
    { v: `${r.injectionPagesFlagged.value} / ${r.injectionPagesFlagged.total}`, l: 'test runs with hidden AI-reviewer instructions caught' },
    { v: `${r.injectionFalsePositives.value} / ${r.injectionFalsePositives.total}`, l: 'clean page runs wrongly flagged' },
    { v: `${r.codeCheckAccuracy.correct} / ${r.codeCheckAccuracy.total}`, l: 'code checks judged correctly' },
    { v: `${(r.inspectionLatencyMs.median / 1000).toFixed(1)} s`, l: 'median inspection, browser to verdict' },
  ];
  return (
    <div className="proof-strip">
      <div className="proof-stats">
        {stats.map((s) => (
          <div key={s.l} className="proof-stat">
            <span className="mono heading-5 lime">{s.v}</span>
            <span className="caption-5 muted">{s.l}</span>
          </div>
        ))}
      </div>
      <div className="proof-foot">
        <span className="caption-4 faint">Built on</span>
        <span className="chip idle mono">PayPal JS SDK v6</span>
        <span className="chip idle mono">Orders v2 · AUTHORIZE</span>
        <span className="chip idle mono">Payments v2 · capture, void, refund</span>
        <a className="caption-4 faint" href="https://github.com/Arnav020/proof-of-done/blob/main/results/metrics.json" target="_blank" rel="noreferrer">
          Measured on hand-labelled pages, see results/metrics.json
        </a>
      </div>
    </div>
  );
}

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
    if (reduced()) return setLit(RECEIPT.length + 1);
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
    if (reduced()) {
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

/* Small live visuals, one per step. Each animates in when its card is visible. */
function BriefVisual({ on }: { on: boolean }) {
  const chips = [
    { icon: <Code size={12} />, t: 'Tap to call', a: '$30.00' },
    { icon: <Code size={12} />, t: 'Opening hours', a: '$30.00' },
    { icon: <Sparkle size={12} />, t: 'Reads cleanly on a phone', a: '$60.00' },
  ];
  return (
    <div className="viz">
      <div className="viz-brief body-6 muted">"A homepage with our hours, a number people can tap to call, and it has to look right on phones."</div>
      <div className="viz-chips">
        {chips.map((c, i) => (
          <span key={c.t} className={`chip idle viz-pop ${on ? 'in' : ''}`} style={{ transitionDelay: `${300 + i * 220}ms` }}>
            {c.icon} {c.t} <span className="mono lime">{c.a}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function HoldVisual({ on }: { on: boolean }) {
  return (
    <div className="viz viz-hold">
      <div className={`viz-lock ${on ? 'in' : ''}`}><Lock size={28} weight="fill" /></div>
      <div className="stack" style={{ gap: 'var(--s-50)' }}>
        <div className="row" style={{ justifyContent: 'space-between' }}><span className="caption-4 muted">Held by PayPal</span><span className="mono title-4 lime">$180.00</span></div>
        <div className="row" style={{ justifyContent: 'space-between' }}><span className="caption-4 muted">Charged so far</span><span className="mono title-4">$0.00</span></div>
        <div className="caption-5 faint mono">intent: AUTHORIZE</div>
      </div>
    </div>
  );
}

function InspectVisual({ on }: { on: boolean }) {
  const rows = [
    { t: 'Tap to call', ok: true },
    { t: 'Opening hours', ok: true },
    { t: 'Reads cleanly on a phone', ok: false },
  ];
  return (
    <div className="viz">
      {rows.map((r, i) => (
        <div key={r.t} className={`viz-row viz-pop ${on ? 'in' : ''}`} style={{ transitionDelay: `${300 + i * 260}ms` }}>
          {r.ok ? <CheckCircle size={16} weight="fill" className="lime" /> : <XCircle size={16} weight="fill" className="coral" />}
          <span className="body-6">{r.t}</span>
        </div>
      ))}
      <div className={`viz-row viz-pop ${on ? 'in' : ''}`} style={{ transitionDelay: '1150ms' }}>
        <span className="caption-4 muted">PayPal captured</span>
        <span className="mono title-4 lime" style={{ marginLeft: 'auto' }}>$60.00</span>
      </div>
    </div>
  );
}

const STEPS = [
  { n: '01', t: 'The brief becomes checks', d: 'The client describes the job in plain words. The scope compiler turns it into milestones and testable criteria, each with a price.', V: BriefVisual },
  { n: '02', t: 'PayPal holds the money', d: 'The client approves a PayPal authorization for each milestone. The freelancer sees the funds are secured. Nobody is charged yet.', V: HoldVisual },
  { n: '03', t: 'The Inspector decides', d: 'The freelancer submits a link. A headless browser and an AI judge test every criterion, and PayPal captures exactly what passed.', V: InspectVisual },
];

/** Each card watches its own visibility, so stacked cards on small screens animate as they arrive. */
function StepCard({ s, i }: { s: (typeof STEPS)[number]; i: number }) {
  const [ref, on] = useInView<HTMLDivElement>(0.3);
  const V = s.V;
  return (
    <div ref={ref} className={`card step reveal ${on ? 'in' : ''}`} style={{ transitionDelay: `${i * 120}ms` }}>
      <V on={on} />
      <div className="mono title-4 n" style={{ marginTop: 'var(--s-300)' }}>{s.n}</div>
      <h3 className="heading-6" style={{ marginTop: 'var(--s-100)' }}>{s.t}</h3>
      <TypeText className="body-6 muted step-text" text={s.d} start={on} delay={500 + i * 250} />
    </div>
  );
}

function Steps() {
  return (
    <section id="how" className="wrap" aria-label="How it works">
      <div className="section-label" style={{ marginBottom: 'var(--s-300)' }}>
        <h2 className="heading-4">How it works</h2>
        <span className="body-6 muted">Three steps, real PayPal calls at every one.</span>
      </div>
      <div className="steps">
        {STEPS.map((s, i) => <StepCard key={s.n} s={s} i={i} />)}
      </div>
    </section>
  );
}

export function Intro({ onStart, hasProject }: { onStart: () => void; hasProject: boolean }) {
  return (
    <>
      <header className="hero wrap">
        <div>
          <div className="wordmark">
            <img src="/favicon.svg" width={40} height={40} alt="" />
            <span className="heading-4">Proof of Done</span>
          </div>
          <h1 className="heading-1 hero-title">
            Pay for work
            <br />
            that is <span className="accent">proven done.</span>
          </h1>
          <p className="sub">
            Proof of Done turns a client brief into checks an AI can verify, holds the money with PayPal,
            and releases only the share of the work that passes inspection.
          </p>
          <div className="actions">
            <button className="btn btn-primary" onClick={onStart}>
              {hasProject ? 'Continue your project' : 'Try a sample project'} <ArrowRight size={18} weight="bold" />
            </button>
            <span className="proof-line caption-4">
              <ShieldCheck size={16} weight="fill" className="lime" /> Live on the PayPal sandbox, every capture ID shown
            </span>
          </div>
        </div>
        <Receipt />
        <ProofStrip />
      </header>
      <TaglineReveal />
      <Steps />
      <section className="wrap cta-end">
        <h2 className="heading-3">See it decide with real PayPal sandbox calls.</h2>
        <p className="body-3 muted">Fund a milestone with the PayPal sandbox, submit a delivery, and watch the Inspector release exactly what passed.</p>
        <button className="btn btn-primary" onClick={onStart}>
          {hasProject ? 'Continue your project' : 'Try a sample project'} <ArrowRight size={18} weight="bold" />
        </button>
      </section>
    </>
  );
}
