import { env } from './env.js';
import { ApiError } from './errors.js';

async function withTimeout<T>(ms: number, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fn(ctl.signal);
  } finally {
    clearTimeout(t);
  }
}

type Msg = { role: 'system' | 'user' | 'assistant'; content: string };

export async function groqChat(opts: { messages: Msg[]; json?: boolean; model?: string; timeoutMs?: number; maxTokens?: number }) {
  if (!env.groqKey) throw new ApiError(503, 'GROQ_NOT_CONFIGURED', 'Groq key missing.');
  return withTimeout(opts.timeoutMs ?? 30000, async (signal) => {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      signal,
      headers: { Authorization: `Bearer ${env.groqKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: opts.model ?? env.groqModel,
        temperature: 0,
        max_tokens: opts.maxTokens ?? 4096,
        messages: opts.messages,
        ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
      }),
    });
    if (!r.ok) throw new ApiError(503, 'GROQ_FAILED', `Groq returned ${r.status}`);
    const j = (await r.json()) as { choices: { message: { content: string } }[] };
    return j.choices[0]?.message?.content ?? '';
  });
}

/** Llama Prompt Guard 2 returns the probability (0..1) that the text is a prompt attack. */
export async function guardScore(text: string): Promise<number> {
  const out = await groqChat({ model: env.guardModel, messages: [{ role: 'user', content: text.slice(0, 2000) }], timeoutMs: 15000, maxTokens: 16 });
  const n = Number.parseFloat(out.trim());
  if (!Number.isFinite(n)) throw new ApiError(503, 'GUARD_BAD_OUTPUT', 'Prompt Guard returned an unexpected value.');
  return n;
}

export type GeminiPart = { text: string } | { inline_data: { mime_type: string; data: string } };

/** Tries each configured Gemini model in order until one answers. */
export async function geminiJson(parts: GeminiPart[], schema?: unknown, timeoutMs = 45000): Promise<{ text: string; model: string }> {
  if (!env.geminiKey) throw new ApiError(503, 'GEMINI_NOT_CONFIGURED', 'Gemini key missing.');
  let lastErr = '';
  for (const model of env.geminiModels) {
    try {
      const text = await withTimeout(timeoutMs, async (signal) => {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST',
          signal,
          headers: { 'x-goog-api-key': env.geminiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts }],
            generationConfig: {
              temperature: 0,
              responseMimeType: 'application/json',
              ...(schema ? { responseSchema: schema } : {}),
            },
          }),
        });
        if (!r.ok) throw new Error(`${model} ${r.status}`);
        const j = (await r.json()) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
        const out = (j.candidates?.[0]?.content?.parts ?? []).filter((p) => !p.thought && p.text).map((p) => p.text).join('');
        if (!out) throw new Error(`${model} empty`);
        return out;
      });
      return { text, model };
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }
  throw new ApiError(503, 'GEMINI_FAILED', `All Gemini models failed (${lastErr}).`);
}

/** Extracts the first JSON object from model output (handles stray code fences). */
export function parseJson<T>(text: string): T {
  const s = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end < start) throw new ApiError(502, 'AI_BAD_JSON', 'AI returned no JSON.');
  return JSON.parse(s.slice(start, end + 1)) as T;
}
