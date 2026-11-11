import { ArrowSquareOut } from '@phosphor-icons/react';
import { createElement, useEffect, useRef, useState } from 'react';
import { api, usd, type Signed } from '../api';
import { getPayPal } from '../paypal';

type Props = {
  signed: Signed;
  mid: string;
  amount: number;
  onFunded: (s: Signed) => void;
  onError: (msg: string) => void;
};

export const PENDING_KEY = 'proof-of-done:pending-order';

/**
 * PayPal JS SDK v6 one-time payment session. The order is created server side with intent AUTHORIZE
 * (amount taken from signed state, never from the browser); onApprove authorizes it on the server.
 * A redirect link to PayPal is offered if the popup cannot open.
 */
export function FundButton({ signed, mid, amount, onFunded, onError }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fallback, setFallback] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const latest = useRef(signed);
  latest.current = signed;

  useEffect(() => {
    let cancelled = false;
    setLoadErr(null);
    getPayPal()
      .then(() => !cancelled && setReady(true))
      .catch((e) => {
        console.warn('[paypal] SDK v6 init failed', e);
        if (!cancelled) {
          setReady(false);
          setLoadErr(e instanceof Error ? e.message : String(e));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  useEffect(() => {
    if (!ready || !host.current) return;
    const el = host.current.querySelector('paypal-button');
    if (!el) return;
    const onClick = async () => {
      setBusy(true);
      try {
        const sdk = await getPayPal();
        const session = sdk.createPayPalOneTimePaymentSession({
          onApprove: async ({ orderId }) => {
            try {
              onFunded(await api.authorize(latest.current, mid, orderId));
            } catch (e) {
              onError(e instanceof Error ? e.message : 'Authorization failed.');
            } finally {
              setBusy(false);
            }
          },
          onCancel: () => setBusy(false),
          onError: () => {
            setBusy(false);
            onError('PayPal could not complete the approval. Try the PayPal.com link instead.');
          },
        });
        const orderPromise = api.order(latest.current, mid).then((o) => {
          if (o.approveUrl) setFallback(o.approveUrl);
          localStorage.setItem(PENDING_KEY, JSON.stringify({ mid, orderId: o.orderId }));
          return { orderId: o.orderId };
        });
        await session.start({ presentationMode: 'auto' }, orderPromise);
      } catch (e) {
        setBusy(false);
        onError(e instanceof Error ? e.message : 'Could not start PayPal.');
      }
    };
    el.addEventListener('click', onClick);
    return () => el.removeEventListener('click', onClick);
  }, [ready, mid, onFunded, onError]);

  const redirect = async () => {
    try {
      const o = await api.order(latest.current, mid);
      localStorage.setItem(PENDING_KEY, JSON.stringify({ mid, orderId: o.orderId }));
      if (o.approveUrl) window.location.href = o.approveUrl;
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not create the PayPal order.');
    }
  };

  return (
    <div className="stack" style={{ gap: 'var(--s-100)' }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <div className="title-3">Secure {usd(amount)} with PayPal</div>
          <div className="caption-5 muted">An authorization holds the money on your PayPal account. You are charged only for criteria that pass.</div>
          <div className="caption-4 lime" style={{ marginTop: 'var(--s-50)' }}>Judging? Log in to PayPal with the sandbox buyer account from the Devpost testing instructions. It is test money.</div>
        </div>
      </div>
      <div ref={host} style={{ minHeight: 48, opacity: busy ? 0.6 : 1 }}>
        {ready ? (
          createElement('paypal-button', { type: 'pay', class: 'paypal-gold' })
        ) : loadErr ? (
          <div className="row caption-4 coral">
            PayPal checkout did not load ({loadErr}).
            <button className="btn btn-sm" onClick={() => setAttempt((n) => n + 1)}>Retry</button>
          </div>
        ) : (
          <div className="skeleton" style={{ height: 48 }} />
        )}
      </div>
      <button className="btn btn-ghost btn-sm" onClick={fallback ? () => (window.location.href = fallback) : redirect} style={{ justifySelf: 'start' }}>
        Popup blocked? Approve on PayPal.com <ArrowSquareOut size={14} />
      </button>
    </div>
  );
}
