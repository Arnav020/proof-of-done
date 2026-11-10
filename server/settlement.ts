import { ApiError, cents, round2 } from './errors.js';
import * as paypal from './paypal.js';
import type { Milestone, Project } from './types.js';

const now = () => new Date().toISOString();

/** Amount the verdicts say is earned (passed, not held for review). */
export function earnedAmount(m: Milestone): number {
  return round2(m.criteria.filter((c) => c.verdict?.pass && !c.verdict.needsReview && !c.refunded).reduce((s, c) => s + c.amount, 0));
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
  if (unit?.reference_id !== m.id || cents(Number(unit.amount.value)) !== cents(m.amount)) {
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
  if (plan.delta <= 0) return null;

  const newlyPaid = m.criteria.filter((c) => c.verdict?.pass && !c.verdict.needsReview && !c.paid);
  const cap = await paypal.captureAuthorization(
    authId,
    plan.delta,
    plan.final,
    `cap-${authId}-${cents(already)}`,
    `Proof of Done: ${m.title} (${newlyPaid.length} criteria verified)`,
  );
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
