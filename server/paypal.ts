import crypto from 'node:crypto';
import { env } from './env.js';
import { ApiError, money } from './errors.js';

let cached: { token: string; exp: number } | null = null;

function basic() {
  return Buffer.from(`${env.paypalClientId}:${env.paypalSecret}`).toString('base64');
}

export async function accessToken(): Promise<string> {
  if (cached && Date.now() < cached.exp) return cached.token;
  if (!env.paypalClientId || !env.paypalSecret) {
    throw new ApiError(500, 'PAYPAL_NOT_CONFIGURED', 'PayPal credentials are not configured on the server.');
  }
  const r = await fetch(`${env.paypalBase}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic()}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  if (!r.ok) throw new ApiError(502, 'PAYPAL_AUTH_FAILED', `PayPal rejected the app credentials (${r.status}).`);
  const j = (await r.json()) as { access_token: string; expires_in: number };
  cached = { token: j.access_token, exp: Date.now() + (j.expires_in - 60) * 1000 };
  return j.access_token;
}

/** Browser-safe client token for PayPal JS SDK v6, bound to the requesting domain. */
export async function clientToken(domain: string): Promise<string> {
  const body = new URLSearchParams({ grant_type: 'client_credentials', response_type: 'client_token', intent: 'sdk_init' });
  body.append('domains[]', domain);
  const r = await fetch(`${env.paypalBase}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic()}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!r.ok) throw new ApiError(502, 'PAYPAL_CLIENT_TOKEN_FAILED', `PayPal could not issue a browser token (${r.status}).`);
  const j = (await r.json()) as { access_token: string };
  return j.access_token;
}

type PayPalErr = { name?: string; message?: string; debug_id?: string; details?: { issue?: string; description?: string }[] };

async function pp<T>(method: 'GET' | 'POST', path: string, body?: unknown, requestId?: string): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${await accessToken()}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
  if (method === 'POST') headers['PayPal-Request-Id'] = requestId ?? crypto.randomUUID();
  const r = await fetch(`${env.paypalBase}${path}`, {
    method,
    headers,
    body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
  });
  const text = await r.text();
  const data = text ? JSON.parse(text) : {};
  if (!r.ok) {
    const e = data as PayPalErr;
    const issue = e.details?.[0]?.issue ?? e.name ?? 'PAYPAL_ERROR';
    const desc = e.details?.[0]?.description ?? e.message ?? `PayPal returned ${r.status}`;
    throw new ApiError(r.status >= 500 ? 502 : 422, `PAYPAL_${issue}`, desc, e.debug_id);
  }
  return data as T;
}

export type PPAmount = { currency_code: string; value: string };
export type PPAuthorization = { id: string; status: string; amount: PPAmount; expiration_time?: string };
export type PPCapture = {
  id: string;
  status: string;
  amount: PPAmount;
  final_capture?: boolean;
  seller_receivable_breakdown?: { gross_amount: PPAmount; paypal_fee?: PPAmount; net_amount?: PPAmount };
};
export type PPOrder = {
  id: string;
  status: string;
  purchase_units: {
    reference_id?: string;
    amount: PPAmount;
    payments?: { authorizations?: PPAuthorization[]; captures?: PPCapture[] };
  }[];
};

export function createAuthorizeOrder(args: {
  amount: number;
  referenceId: string;
  customId: string;
  description: string;
  returnUrl: string;
}) {
  return pp<PPOrder>('POST', '/v2/checkout/orders', {
    intent: 'AUTHORIZE',
    purchase_units: [
      {
        reference_id: args.referenceId,
        custom_id: args.customId.slice(0, 127),
        description: args.description.slice(0, 127),
        amount: { currency_code: 'USD', value: money(args.amount) },
      },
    ],
    payment_source: {
      paypal: {
        experience_context: {
          brand_name: 'Proof of Done',
          shipping_preference: 'NO_SHIPPING',
          user_action: 'CONTINUE',
          return_url: args.returnUrl,
          cancel_url: args.returnUrl,
        },
      },
    },
  });
}

export const getOrder = (id: string) => pp<PPOrder>('GET', `/v2/checkout/orders/${encodeURIComponent(id)}`);
export const authorizeOrder = (id: string) =>
  pp<PPOrder>('POST', `/v2/checkout/orders/${encodeURIComponent(id)}/authorize`, {}, `auth-${id}`);
export const getAuthorization = (id: string) =>
  pp<PPAuthorization>('GET', `/v2/payments/authorizations/${encodeURIComponent(id)}`);
export const getCapture = (id: string) => pp<PPCapture>('GET', `/v2/payments/captures/${encodeURIComponent(id)}`);

export function captureAuthorization(authId: string, amount: number, finalCapture: boolean, requestId: string, note: string) {
  return pp<PPCapture>(
    'POST',
    `/v2/payments/authorizations/${encodeURIComponent(authId)}/capture`,
    { amount: { currency_code: 'USD', value: money(amount) }, final_capture: finalCapture, note_to_payer: note.slice(0, 255) },
    requestId,
  );
}

export function voidAuthorization(authId: string) {
  return pp<Record<string, unknown>>('POST', `/v2/payments/authorizations/${encodeURIComponent(authId)}/void`, {}, `void-${authId}`);
}

export function refundCapture(captureId: string, amount: number, note: string, requestId: string) {
  return pp<{ id: string; status: string; amount: PPAmount }>(
    'POST',
    `/v2/payments/captures/${encodeURIComponent(captureId)}/refund`,
    { amount: { currency_code: 'USD', value: money(amount) }, note_to_payer: note.slice(0, 255) },
    requestId,
  );
}

/** Sum of captures PayPal itself reports on an order (the source of truth, never client state). */
export function capturedOnOrder(order: PPOrder): number {
  const caps = order.purchase_units[0]?.payments?.captures ?? [];
  return caps
    .filter((c) => ['COMPLETED', 'PENDING', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(c.status))
    .reduce((s, c) => s + Number(c.amount.value), 0);
}
