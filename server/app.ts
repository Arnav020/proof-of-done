import express, { type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { buildProject, compileScope } from './compiler.js';
import { env } from './env.js';
import { ApiError } from './errors.js';
import { capturePage, inspectMilestone } from './inspector.js';
import * as paypal from './paypal.js';
import { authorizeMilestone, refundCriterion, reviewCriterion, settleMilestone, voidMilestone } from './settlement.js';
import { findMilestone, unwrap, wrap } from './state.js';

export const app = express();
app.disable('x-powered-by');
// Vercel's edge sets X-Forwarded-For; trust exactly one hop so clients cannot spoof their IP.
app.set('trust proxy', 1);
app.use(express.json({ limit: '200kb' }));
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

type Handler = (req: Request, res: Response) => Promise<unknown>;
const h = (fn: Handler) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

/** Best-effort per-IP limiter for endpoints that spend free AI quota (per serverless instance). */
const hits = new Map<string, number[]>();
const limit = (perMinute: number, name: string) => (req: Request, _res: Response, next: NextFunction) => {
  // Named buckets: funding, inspecting and settling no longer share one counter (a demo could hit 429).
  const key = `${req.ip}:${name}`;
  if (hits.size > 5000) hits.clear();
  const t = Date.now();
  const arr = (hits.get(key) ?? []).filter((x) => t - x < 60000);
  if (arr.length >= perMinute) return next(new ApiError(429, 'RATE_LIMITED', 'Too many requests. Wait a minute and try again.'));
  arr.push(t);
  hits.set(key, arr);
  next();
};

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, paypal: !!(env.paypalClientId && env.paypalSecret), gemini: !!env.geminiKey, groq: !!env.groqKey, mode: env.paypalEnv, geminiModels: env.geminiModels });
});

/** Proves headless Chromium works on this host by loading our own fixed demo page (no AI, no user input). */
app.get('/api/health/inspector', limit(4, 'selftest'), h(async (req, res) => {
  const host = (req.headers['x-forwarded-host'] as string | undefined)?.split(',')[0] ?? req.get('host');
  const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0] ?? req.protocol;
  const t0 = Date.now();
  const { facts } = await capturePage(`${proto}://${host}/demo-sites/larkhill-v2/index.html`);
  res.json({ ok: true, ms: Date.now() - t0, title: facts.title, counts: facts.counts, mobileOverflowPx: facts.mobileOverflowPx });
}));

app.get('/api/config', (_req, res) => {
  res.json({ paypalClientId: env.paypalClientId, environment: env.paypalEnv });
});

app.post('/api/paypal/client-token', limit(30, 'token'), h(async (req, res) => {
  const host = (req.headers['x-forwarded-host'] as string | undefined)?.split(',')[0] ?? req.hostname;
  res.json({ clientToken: await paypal.clientToken(host.replace(/:\d+$/, '')) });
}));

const compileBody = z.object({
  brief: z.string().trim().min(20, 'Brief is too short').max(4000, 'Brief is too long'),
  price: z.number().min(50).max(10000),
  clientName: z.string().trim().max(60).optional(),
  freelancerName: z.string().trim().max(60).optional(),
});

app.post('/api/scope/compile', limit(8, 'compile'), h(async (req, res) => {
  const b = compileBody.safeParse(req.body);
  if (!b.success) throw new ApiError(400, 'BAD_INPUT', b.error.issues[0]?.message ?? 'Invalid input');
  const { plan, model } = await compileScope(b.data.brief);
  const project = buildProject(plan, {
    brief: b.data.brief, price: b.data.price,
    clientName: b.data.clientName || 'Maple Street Bakery', freelancerName: b.data.freelancerName || 'Riya (freelance web dev)',
  });
  res.json({ ...wrap(project), model });
}));

app.post('/api/milestones/:mid/order', limit(20, 'order'), h(async (req, res) => {
  const p = unwrap(req.body);
  const m = findMilestone(p, String(req.params.mid));
  if (m.payment.authorizationId) throw new ApiError(409, 'ALREADY_FUNDED', 'This milestone is already funded.');
  const host = (req.headers['x-forwarded-host'] as string | undefined)?.split(',')[0] ?? req.get('host');
  const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0] ?? req.protocol;
  const order = await paypal.createAuthorizeOrder({
    amount: m.amount, referenceId: m.id, customId: p.id, description: `${p.title}: ${m.title}`, returnUrl: `${proto}://${host}/?paypal_return=${m.id}`,
  });
  const approveUrl = order.links?.find((l) => l.rel === 'payer-action' || l.rel === 'approve')?.href;
  res.json({ orderId: order.id, approveUrl });
}));

app.post('/api/milestones/:mid/authorize', limit(20, 'authorize'), h(async (req, res) => {
  const p = unwrap(req.body);
  const m = findMilestone(p, String(req.params.mid));
  const orderId = z.string().regex(/^[A-Z0-9]{10,25}$/).safeParse(req.body.orderId);
  if (!orderId.success) throw new ApiError(400, 'BAD_ORDER_ID', 'Invalid PayPal order id.');
  await authorizeMilestone(p, m, orderId.data);
  res.json(wrap(p));
}));

app.post('/api/milestones/:mid/inspect', limit(8, 'inspect'), h(async (req, res) => {
  const p = unwrap(req.body);
  const m = findMilestone(p, String(req.params.mid));
  if (!m.payment.authorizationId) throw new ApiError(409, 'NOT_FUNDED', 'The client must secure this milestone with PayPal before work is inspected.');
  if (m.status === 'voided' || m.status === 'paid') throw new ApiError(409, 'CLOSED', `This milestone is already ${m.status}.`);
  const url = z.string().url().max(2000).safeParse(req.body.url);
  if (!url.success) throw new ApiError(400, 'URL_INVALID', 'Enter a full link starting with https://');

  const report = await inspectMilestone(m, url.data, p.brief);
  const at = report.at;
  for (const d of report.details) {
    const c = m.criteria.find((x) => x.id === d.criterionId);
    if (!c || c.paid) continue;
    c.verdict = { pass: d.pass, confidence: d.confidence, evidence: d.evidence, source: d.source, needsReview: d.needsReview, at };
  }
  m.status = m.payment.captured > 0 ? 'partially_paid' : 'in_review';
  m.lastInspection = {
    url: report.url, at, injectionFlag: report.injection.flagged,
    injectionDetail: report.injection.flagged ? `${report.injection.where}: "${(report.injection.snippet ?? '').slice(0, 160)}"` : undefined,
    models: report.models,
  };
  const passed = report.details.filter((d) => d.pass).length;
  p.events.push({ at, type: 'inspected', milestoneId: m.id, note: `AI Inspector: ${passed}/${report.details.length} criteria passed on ${report.url}` });
  if (report.injection.flagged) {
    p.events.push({ at, type: 'flagged', milestoneId: m.id, note: `Reviewer-manipulation attempt detected in ${report.injection.where} (${report.injection.method})` });
  }
  res.json({ ...wrap(p), report });
}));

app.post('/api/milestones/:mid/settle', limit(20, 'settle'), h(async (req, res) => {
  const p = unwrap(req.body);
  const m = findMilestone(p, String(req.params.mid));
  const capture = await settleMilestone(p, m);
  res.json({ ...wrap(p), capture });
}));

app.post('/api/milestones/:mid/void', limit(20, 'void'), h(async (req, res) => {
  const p = unwrap(req.body);
  const m = findMilestone(p, String(req.params.mid));
  await voidMilestone(p, m);
  res.json(wrap(p));
}));

const reviewBody = z.object({ criterionId: z.string().max(20), decision: z.enum(['approve', 'reject']) });

/** Client resolves a held criterion; an approval is captured from the PayPal authorization right away. */
app.post('/api/milestones/:mid/review', limit(20, 'review'), h(async (req, res) => {
  const p = unwrap(req.body);
  const m = findMilestone(p, String(req.params.mid));
  const b = reviewBody.safeParse(req.body);
  if (!b.success) throw new ApiError(400, 'BAD_INPUT', 'criterionId and decision are required.');
  reviewCriterion(p, m, b.data.criterionId, b.data.decision);
  const capture = b.data.decision === 'approve' ? await settleMilestone(p, m) : null;
  res.json({ ...wrap(p), capture });
}));

app.post('/api/milestones/:mid/refund', limit(20, 'refund'), h(async (req, res) => {
  const p = unwrap(req.body);
  const m = findMilestone(p, String(req.params.mid));
  const cid = z.string().max(20).safeParse(req.body.criterionId);
  if (!cid.success) throw new ApiError(400, 'BAD_INPUT', 'criterionId required');
  await refundCriterion(p, m, cid.data);
  res.json(wrap(p));
}));

app.get('/api/paypal/orders/:id', limit(30, 'verify'), h(async (req, res) => {
  const id = z.string().regex(/^[A-Z0-9]{10,25}$/).safeParse(req.params.id);
  if (!id.success) throw new ApiError(400, 'BAD_ORDER_ID', 'Invalid PayPal order id.');
  const o = await paypal.getOrder(id.data);
  const u = o.purchase_units[0];
  res.json({
    id: o.id, status: o.status, amount: u?.amount,
    authorizations: (u?.payments?.authorizations ?? []).map((a) => ({ id: a.id, status: a.status, amount: a.amount.value })),
    captures: (u?.payments?.captures ?? []).map((c) => ({ id: c.id, status: c.status, amount: c.amount.value })),
  });
}));

app.use('/api', (_req, _res, next) => next(new ApiError(404, 'NOT_FOUND', 'Unknown endpoint.')));

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.message, code: err.code, debugId: err.debugId });
  }
  if (err && typeof err === 'object' && 'type' in err && (err as { type: string }).type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request too large.', code: 'TOO_LARGE' });
  }
  if (err instanceof SyntaxError) return res.status(400).json({ error: 'Malformed JSON.', code: 'BAD_JSON' });
  console.error('[unhandled]', err);
  res.status(500).json({ error: 'Something went wrong on our side.', code: 'INTERNAL' });
});
