import { ArrowRight, Compass } from '@phosphor-icons/react';
import { usd, type Project } from '../api';

type Role = 'client' | 'freelancer';
type M = Project['milestones'][number];

type Step = { n: number; title: string; text: string; action?: { label: string; run: () => void } };

/** Tells a first-time visitor exactly what to do next, based on the selected milestone and role. */
export function nextStep(m: M, role: Role, total: number, setRole: (r: Role) => void, goNext: (() => void) | null): Step {
  const held = m.criteria.filter((c) => c.verdict?.needsReview && !c.paid);
  const failed = m.criteria.filter((c) => c.verdict && !c.verdict.pass && !c.verdict.needsReview && !c.paid);
  const funded = !!m.payment.authorizationId;
  const label = `Milestone ${m.index + 1} of ${total}`;

  if (m.status === 'voided') {
    return { n: 4, title: `${label} is voided`, text: 'The authorization was cancelled, so the client was never charged for the rest.', action: goNext ? { label: 'Go to the next milestone', run: goNext } : undefined };
  }
  if (m.status === 'paid') {
    return { n: 4, title: `${label} is paid in full`, text: `PayPal captured all ${usd(m.amount)} after every criterion passed.`, action: goNext ? { label: 'Go to the next milestone', run: goNext } : undefined };
  }
  if (!funded) {
    return role === 'client'
      ? { n: 1, title: 'Secure this milestone with PayPal', text: `Click Pay with PayPal below and approve with the sandbox buyer login (judges: see the Devpost testing instructions). ${usd(m.amount)} is held, not charged.` }
      : { n: 1, title: 'Waiting for the client to fund this milestone', text: 'Work starts once PayPal holds the money.', action: { label: 'Switch to Client to fund it', run: () => setRole('client') } };
  }
  if (held.length) {
    return role === 'client'
      ? { n: 3, title: `${held.length} criteria need your decision`, text: 'The Inspector held them (low confidence or a manipulation attempt). Approve to pay from the hold, or reject.' }
      : { n: 3, title: 'Waiting for the client to review held criteria', text: 'Some results were held for a human decision.', action: { label: 'Switch to Client to review', run: () => setRole('client') } };
  }
  if (role === 'client') {
    return {
      n: 2,
      title: m.payment.captured > 0 ? 'Partly paid, waiting for fixes' : 'Funds are held, waiting for delivery',
      text: m.payment.captured > 0 ? `${usd(m.payment.captured)} captured so far. The rest stays held until it passes.` : 'Switch to the freelancer to submit the work for inspection.',
      action: { label: 'Switch to Freelancer', run: () => setRole('freelancer') },
    };
  }
  return failed.length
    ? { n: 2, title: `Fix ${failed.length} failing criteria and resubmit`, text: 'Only newly passing criteria are paid on the next inspection. Try the fixed demo delivery below.' }
    : { n: 2, title: 'Submit your delivery for inspection', text: 'Paste the link (or pick a demo delivery) and press Inspect and get paid.' };
}

export function Guide({ step }: { step: Step }) {
  return (
    <div className="guide" aria-live="polite">
      <Compass size={22} weight="duotone" className="lime" />
      <div>
        <div className="caption-3 lime">Next step</div>
        <div className="title-3" style={{ marginTop: 'var(--s-25)' }}>{step.title}</div>
        <div className="body-6 muted">{step.text}</div>
      </div>
      {step.action && (
        <button className="btn btn-sm" onClick={step.action.run}>
          {step.action.label} <ArrowRight size={14} />
        </button>
      )}
    </div>
  );
}
