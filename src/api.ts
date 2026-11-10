import type { Project, Signed } from '../server/types';
import type { InspectionReport } from '../server/inspector';

export type { Project, Signed, InspectionReport };

export class ApiFail extends Error {
  constructor(message: string, public code: string, public debugId?: string) {
    super(message);
  }
}

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiFail('Network error. Check your connection and try again.', 'NETWORK');
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiFail(data.error ?? `Request failed (${r.status}).`, data.code ?? 'HTTP', data.debugId);
  return data as T;
}

export const api = {
  health: () => call<{ ok: boolean; paypal: boolean; gemini: boolean; groq: boolean; mode: string }>('GET', '/api/health'),
  clientToken: () => call<{ clientToken: string }>('POST', '/api/paypal/client-token', {}),
  compile: (brief: string, price: number, extra: { clientName?: string; freelancerName?: string; sampleId?: string } = {}) =>
    call<Signed & { model: string }>('POST', '/api/scope/compile', { brief, price, ...extra }),
  order: (s: Signed, mid: string) => call<{ orderId: string; approveUrl?: string }>('POST', `/api/milestones/${mid}/order`, s),
  authorize: (s: Signed, mid: string, orderId: string) => call<Signed>('POST', `/api/milestones/${mid}/authorize`, { ...s, orderId }),
  inspect: (s: Signed, mid: string, url: string) => call<Signed & { report: InspectionReport }>('POST', `/api/milestones/${mid}/inspect`, { ...s, url }),
  settle: (s: Signed, mid: string) => call<Signed & { capture: unknown }>('POST', `/api/milestones/${mid}/settle`, s),
  void: (s: Signed, mid: string) => call<Signed>('POST', `/api/milestones/${mid}/void`, s),
  review: (s: Signed, mid: string, criterionId: string, decision: 'approve' | 'reject') =>
    call<Signed & { capture: { id: string; amount: number; final: boolean } | null }>('POST', `/api/milestones/${mid}/review`, { ...s, criterionId, decision }),
  refund: (s: Signed, mid: string, criterionId: string) => call<Signed>('POST', `/api/milestones/${mid}/refund`, { ...s, criterionId }),
  verifyOrder: (orderId: string) =>
    call<{ id: string; status: string; authorizations: { id: string; status: string; amount: string }[]; captures: { id: string; status: string; amount: string }[] }>(
      'GET', `/api/paypal/orders/${orderId}`,
    ),
};

const KEY = 'proof-of-done:project';
export const store = {
  load(): Signed | null {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as Signed) : null;
    } catch {
      return null;
    }
  },
  save(s: Signed | null) {
    try {
      if (s) localStorage.setItem(KEY, JSON.stringify(s));
      else localStorage.removeItem(KEY);
    } catch {
      /* storage unavailable: the session still works in memory */
    }
  },
};

export const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
