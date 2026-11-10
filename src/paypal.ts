import { api } from './api';

/* Minimal typings for the PayPal JS SDK v6 surface we use. */
type Session = { start: (opts: { presentationMode: 'auto' | 'popup' | 'modal' | 'redirect' }, order: Promise<{ orderId: string }>) => Promise<void> };
type SdkInstance = {
  findEligibleMethods: (o: { currencyCode: string }) => Promise<{ isEligible: (m: string) => boolean }>;
  createPayPalOneTimePaymentSession: (o: {
    onApprove: (d: { orderId: string }) => Promise<void> | void;
    onCancel?: () => void;
    onError?: (e: unknown) => void;
  }) => Session;
};
declare global {
  interface Window {
    paypal?: { createInstance: (o: { clientToken: string; components: string[]; pageType?: string }) => Promise<SdkInstance> };
  }
}

const SDK_URL = 'https://www.sandbox.paypal.com/web-sdk/v6/core';
let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.paypal) return Promise.resolve();
  scriptPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SDK_URL;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error('Could not load the PayPal SDK.'));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

let instancePromise: Promise<SdkInstance> | null = null;

/** Loads SDK v6 and creates one instance with a server-issued, domain-bound client token. */
export async function getPayPal(): Promise<SdkInstance> {
  instancePromise ??= (async () => {
    await loadScript();
    const { clientToken } = await api.clientToken();
    const sdk = await window.paypal!.createInstance({ clientToken, components: ['paypal-payments'], pageType: 'checkout' });
    const methods = await sdk.findEligibleMethods({ currencyCode: 'USD' });
    if (!methods.isEligible('paypal')) throw new Error('PayPal is not available for this browser session.');
    return sdk;
  })().catch((e) => {
    instancePromise = null;
    throw e;
  });
  return instancePromise;
}
