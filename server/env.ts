import 'dotenv/config';
import crypto from 'node:crypto';

const list = (v: string | undefined, d: string) =>
  (v ?? d).split(',').map((s) => s.trim()).filter(Boolean);

let stateSecret = process.env.STATE_SECRET ?? '';
if (!stateSecret) {
  if (process.env.VERCEL) throw new Error('STATE_SECRET must be set in production');
  stateSecret = crypto.randomBytes(32).toString('hex');
  console.warn('[env] STATE_SECRET not set: using a random per-process secret (projects reset on restart).');
}

export const env = {
  paypalClientId: process.env.PAYPAL_CLIENT_ID ?? '',
  paypalSecret: process.env.PAYPAL_CLIENT_SECRET ?? '',
  paypalBase: process.env.PAYPAL_API_BASE ?? 'https://api-m.sandbox.paypal.com',
  paypalEnv: process.env.PAYPAL_ENVIRONMENT ?? 'SANDBOX',
  geminiKey: process.env.GEMINI_API_KEY ?? '',
  groqKey: process.env.GROQ_API_KEY ?? '',
  // Ordered fallbacks. Quota errors fail in under a second, so later models still fit the time budget.
  // Gemma runs on a separate free quota and reads screenshots too.
  geminiModels: list(process.env.GEMINI_MODELS, 'gemini-3.5-flash,gemini-3-flash-preview,gemini-flash-lite-latest,gemini-3.1-flash-lite,gemma-4-26b-a4b-it'),
  groqModel: process.env.GROQ_MODEL ?? 'openai/gpt-oss-120b',
  guardModel: process.env.GROQ_GUARD_MODEL ?? 'meta-llama/llama-prompt-guard-2-86m',
  stateSecret,
  allowLocalUrls: process.env.ALLOW_LOCAL_URLS === '1' && !process.env.VERCEL,
  chromePath: process.env.CHROME_PATH ?? '',
  isVercel: !!process.env.VERCEL,
};

// Safety rail: this project only ever talks to the PayPal sandbox.
if (!env.paypalBase.includes('sandbox')) {
  throw new Error('PAYPAL_API_BASE must point at the PayPal sandbox');
}
