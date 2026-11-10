/** Diagnoses the Gemini/Gemma fallback chain: which model answers right now, how fast, and why others fail. */
import { env } from '../server/env.js';

for (const model of env.geminiModels) {
  const t0 = Date.now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 45000);
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'x-goog-api-key': env.geminiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Return {"ok": true} as JSON.' }] }],
        generationConfig: model.startsWith('gemma') ? { temperature: 0 } : { temperature: 0, responseMimeType: 'application/json' },
      }),
    });
    const body = await r.text();
    console.log(model.padEnd(28), r.status, `${Date.now() - t0} ms`, body.replace(/\s+/g, ' ').slice(0, 120));
  } catch (e) {
    console.log(model.padEnd(28), 'ERR', `${Date.now() - t0} ms`, (e as Error).name);
  } finally {
    clearTimeout(timer);
  }
}
