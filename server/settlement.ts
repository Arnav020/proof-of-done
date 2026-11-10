import { ApiError, cents, round2 } from './errors.js';
import * as paypal from './paypal.js';
import type { Milestone, Project } from './types.js';

const now = () => new Date().toISOString();

/**
 * Amount the verdicts say is earned (passed, not held for review). Refunded criteria still count: they were
 * captured and PayPal's captured total stays gross after a refund, so excluding them would underpay later
 * criteria (found by an independent review).
 */
export function earnedAmount(m: Milestone): number {
  return round2(m.criteria.filter((c) => c.verdict?.pass && !c.verdict.needsReview).reduce((s, c) => s + c.amount, 0));
}

/** Idempotency key bound to the exact capture: authorization, prior total, amount and the criteria it pays for. */
export function captureKey(authId: string, already: number, delta: number, criterionIds: string[]): string {
  return `cap-${authId}-${cents(already)}-${cents(delta)}-${[...criterionIds].sort().join('.')}`.slice(0, 108);
}

/**
 * Pure capture plan. `alreadyCaptured` must come from PayPal, never from client state,
 * so replaying an old signed state can never capture more than was earned.
 */
export function planCapture(m: Milestone, alreadyCaptured: number, authorized: number) {
  const earned = earnedAmount(m);
  const delta = round2(Math.min(earned, authorized) - alreadyCaptured);
  const allPassed = m.criteria.every((c) => c.verdict?.pass && !c.verdict.needsReview);
  return { earned, delta, final: allPassed && cents(alreadyCaptured + delta) >= cents(authorized) };
}

export async function authorizeMilestone(p: Project, m: Milestone, orderId: string) {
  if (m.payment.authorizationId) throw new ApiError(409, 'ALREADY_FUNDED', 'This milestone is already funded.');
  const before = await paypal.getOrder(orderId);
  const unit = before.purchase_units[0];
  // reference_id is only m1/m2/..., so also require the order to belong to this project (custom_id).
  if (unit?.reference_id !== m.id || unit.custom_id !== p.id.slice(0, 127) || cents(Number(unit.amount.value)) !== cents(m.amount)) {
    throw new ApiError(422, 'ORDER_MISMATCH', 'That PayPal order does not match this milestone.');
  }
  if (before.status !== 'APPROVED') throw new ApiError(422, 'ORDER_NOT_APPROVED', `The payer has not approved this order yet (status ${before.status}).`);
  const order = await paypal.authorizeOrder(orderId);
  const auth = order.purchase_units[0]?.payments?.authorizations?.[0];
  if (!auth) throw new ApiError(502, 'NO_AUTHORIZATION', 'PayPal did not return an authorization.');
  m.payment.orderId = orderId;
  m.payment.authorizationId = auth.id;
  m.payment.authorizedAmount = Number(auth.amount.value);
  m.payment.authorizationExpires = auth.expiration_time;
  m.status = 'funded';
  p.events.push({ at: now(), type: 'authorized', milestoneId: m.id, amount: Number(auth.amount.value), paypalId: auth.id, status: auth.status, note: `PayPal authorization placed: $${auth.amount.value} held on the client's account` });
}

export async function settleMilestone(p: Project, m: Milestone) {
  const authId = m.payment.authorizationId;
  if (!authId || !m.payment.orderId) throw new ApiError(409, 'NOT_FUNDED', 'Fund this milestone with PayPal before settling.');
  if (m.status === 'voided') throw new ApiError(409, 'VOIDED', 'This milestone was voided.');
  const order = await paypal.getOrder(m.payment.orderId);
  const already = round2(paypal.capturedOnOrder(order));
  const authorized = m.payment.authorizedAmount ?? m.amount;
  const plan = planCapture(m, already, authorized);
  m.payment.captured = already;
  const newlyPaid = m.criteria.filter((c) => c.verdict?.pass && !c.verdict.needsReview && !c.paid);
  if (plan.delta <= 0) {
    // Reconcile: if PayPal already holds captures covering these criteria (for example a capture whose response was
    // lost), mark them paid instead of leaving state out of sync with PayPal.
    if (newlyPaid.length && cents(already) >= cents(plan.earned)) {
      newlyPaid.forEach((c) => (c.paid = true));
      if (m.criteria.every((c) => c.paid)) m.status = 'paid';
    }
    return null;
  }

  const cap = await paypal.captureAuthorization(
    authId,
    plan.delta,
    plan.final,
    captureKey(authId, already, plan.delta, newlyPaid.map((c) => c.id)),
    `Proof of Done: ${m.title} (${newlyPaid.length} criteria verified)`,
  );
  if (cents(Number(cap.amount.value)) !== cents(plan.delta)) {
    throw new ApiError(409, 'CAPTURE_MISMATCH', 'PayPal returned a capture for a different amount. Refresh and verify with PayPal.');
  }
  const b = cap.seller_receivable_breakdown;
  newlyPaid.forEach((c) => (c.paid = true));
  m.payment.captured = round2(already + Number(cap.amount.value));
  m.payment.captures.push({
    id: cap.id, amount: Number(cap.amount.value), fee: b?.paypal_fee ? Number(b.paypal_fee.value) : undefined,
    net: b?.net_amount ? Number(b.net_amount.value) : undefined, status: cap.status, final: plan.final,
    criterionIds: newlyPaid.map((c) => c.id), at: now(),
  });
  m.status = plan.final ? 'paid' : 'partially_paid';
  p.events.push({
    at: now(), type: 'captured', milestoneId: m.id, amount: Number(cap.amount.value), paypalId: cap.id, status: cap.status,
    note: `${plan.final ? 'Final capture' : 'Partial capture'} for ${newlyPaid.map((c) => c.title).join(', ')}`,
  });
  return m.payment.captures[m.payment.captures.length - 1];
}

export async function voidMilestone(p: Project, m: Milestone) {
  const authId = m.payment.authorizationId;
  if (!authId) throw new ApiError(409, 'NOT_FUNDED', 'Nothing to void: this milestone was never funded.');
  if (m.status === 'paid') throw new ApiError(409, 'ALREADY_PAID', 'This milestone is fully paid; nothing is left to void.');
  await paypal.voidAuthorization(authId);
  const auth = await paypal.getAuthorization(authId);
  const released = round2((m.payment.authorizedAmount ?? m.amount) - m.payment.captured);
  m.status = 'voided';
  m.payment.voidedAt = now();
  p.events.push({ at: now(), type: 'voided', milestoneId: m.id, amount: released, paypalId: authId, status: auth.status, note: `Authorization voided: $${released.toFixed(2)} released back to the client, never charged` });
}

/** Human in the loop: the client resolves a criterion the Inspector held for review (low confidence or manipulation). */
export function reviewCriterion(p: Project, m: Milestone, criterionId: string, decision: 'approve' | 'reject') {
  const c = m.criteria.find((x) => x.id === criterionId);
  if (!c || c.paid || !c.verdict?.needsReview) throw new ApiError(409, 'NOT_REVIEWABLE', 'Only criteria held for review can be approved or rejected.');
  if (m.status === 'voided') throw new ApiError(409, 'VOIDED', 'This milestone was voided.');
  const approve = decision === 'approve';
  c.verdict = {
    pass: approve, confidence: 1, source: 'client', needsReview: false, at: now(),
    evidence: approve ? `Approved by the client after review. (Inspector said: ${c.verdict.evidence.slice(0, 160)})` : 'Rejected by the client after review.',
  };
  p.events.push({ at: now(), type: 'reviewed', milestoneId: m.id, amount: c.amount, note: `Client ${approve ? 'approved' : 'rejected'} "${c.title}"` });
}

export async function refundCriterion(p: Project, m: Milestone, criterionId: string) {
  const c = m.criteria.find((x) => x.id === criterionId);
  if (!c || !c.paid || c.refunded) throw new ApiError(409, 'NOT_REFUNDABLE', 'Only a paid criterion can be refunded.');
  const capture = m.payment.captures.find((x) => x.criterionIds.includes(c.id));
  if (!capture) throw new ApiError(409, 'NO_CAPTURE', 'No capture found for that criterion.');
  const r = await paypal.refundCapture(capture.id, c.amount, `Refund for "${c.title}" after client review`, `ref-${capture.id}-${c.id}`);
  c.refunded = true;
  m.payment.refunds.push({ id: r.id, amount: Number(r.amount.value), status: r.status, criterionId: c.id, at: now() });
  p.events.push({ at: now(), type: 'refunded', milestoneId: m.id, amount: Number(r.amount.value), paypalId: r.id, status: r.status, note: `Refunded "${c.title}" to the client` });
}
