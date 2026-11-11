# Proof of Done: Architecture

Proof of Done lets a client and a freelancer agree on what "done" means, holds the client's money with a PayPal authorization, has an AI Inspector test the real deliverable in a headless browser, and captures exactly the share of the work that passed. If nothing is delivered, the authorization is voided and the client is never charged.

## 1. Components

| Component | Where | Responsibility |
|---|---|---|
| Web app | `src/` (React + Vite) | Client and Freelancer views, PayPal JS SDK v6 checkout, inspection evidence viewer, money ledger, Bryntum Gantt timeline |
| API | `server/app.ts`, exported to Vercel by `api/index.ts` | Stateless Express app. Validates and signs project state, talks to PayPal, runs AI and the Inspector |
| Scope compiler | `server/compiler.ts` | Brief text to milestones and weighted, testable acceptance criteria (Groq, Gemini fallback), validated with zod |
| Inspector | `server/inspector.ts`, `server/browser.ts`, `server/checks.ts`, `server/egress.ts` | Loads the delivered URL at desktop and mobile sizes, collects page facts, runs deterministic checks, then asks Gemini to judge visual and content criteria from screenshots |
| Injection guard | `server/injection.ts` | Flags text aimed at AI reviewers (hidden or visible) with Groq Llama Prompt Guard 2 plus heuristics |
| Payment engine | `server/paypal.ts`, `server/settlement.ts` | Orders v2 (AUTHORIZE), Payments v2 (capture, void, refund), browser-safe client token for SDK v6. Computes capture amounts from verdicts and from PayPal's own record of what is already captured |
| State signer | `server/state.ts` | HMAC-SHA256 over the canonical project JSON so the browser can hold state without being able to forge verdicts |
| Demo deliverables | `public/demo-sites/`, `public/eval-sites/` | Fictional sites: bakery `larkhill-v1` (partial), `larkhill-v2` (fixed), `larkhill-menu` (hidden prompt injection); food bank `riverbend-campaign-v1` (missing alt text), `riverbend-campaign-v2` (accessible), `riverbend-volunteer`; evaluation pages in `eval-sites` |

## 2. Why this shape (and what we did not add)

- **No database.** Vercel's free tier has no persistent disk, and free hosted databases add signup and expiry risk. The client keeps the project in `localStorage`; every API call sends `{project, sig}` and the server rejects any state whose signature does not match. Money state is never trusted from the client: before every capture the server reads the order from PayPal and uses PayPal's captured total.
- **Two AI providers, each for what it is good at.** Groq (fast text, JSON) compiles scope and runs Prompt Guard. Groq's free model list has no vision model, so Gemini judges screenshots. Each is a fallback for the other's text tasks.
- **Deterministic checks before AI.** Anything a script can verify (text present, form exists, mobile overflow, load time, alt text) is checked by code, and the model cannot override it. AI only judges what code cannot (visual quality, tone, layout intent).
- **Scope contract.** When the client numbers deliverables, the compiler must return exactly that many milestones; a response that merges them is rejected and retried.
- **Not added:** vector DB, multi-agent orchestration, queues. None would change what the judges see.

## 3. Data model (carried in signed state)

```ts
Project {
  id, version: 1, title, brief, clientName, freelancerName,
  currency: "USD", total: number, createdAt: ISO,
  milestones: Milestone[], events: LedgerEvent[]
}
Milestone {
  id, index, title, summary, amount, startOffsetDays, durationDays, dueAt: ISO,
  status: "awaiting_funding" | "funded" | "in_review" | "partially_paid" | "paid" | "voided",
  criteria: Criterion[],
  payment: { orderId?, authorizationId?, authorizedAmount?, captured: number,
             captures: {id, amount, fee?, net?, status, criterionIds[], at}[],
             refunds: {id, amount, status, criterionId, at}[], voidedAt? },
  lastInspection?: { url, at, injectionFlag: boolean, injectionDetail?: string }
}
Criterion {
  id, title, description, kind: "deterministic" | "visual" | "content",
  check?: CheckSpec, amount: number,
  verdict?: { pass: boolean, confidence: number, evidence: string,
              source: "code" | "ai" | "guard", needsReview: boolean, at: ISO },
  paid: boolean
}
CheckSpec =
  | { op: "text_present", any: string[] }
  | { op: "element_present", element: "form" | "email_input" | "phone_link" | "image" | "button" | "nav" | "footer" | "map", min?: number }
  | { op: "mobile_no_horizontal_scroll" }
  | { op: "load_time_under", ms: number }
  | { op: "viewport_meta" }
  | { op: "images_have_alt" }
  | { op: "title_contains", any: string[] }
LedgerEvent { at, type: "authorized" | "captured" | "refunded" | "voided" | "inspected" | "flagged", milestoneId, amount?, paypalId?, status?, note }
```

Criterion amounts within a milestone always sum exactly to the milestone amount (cents rounding applied to the last criterion).

## 4. API contracts

All bodies are JSON. `S` means `{ project: Project, sig: string }`. Errors are `{ error: string, code: string, debugId?: string }` with a 4xx or 5xx status, never a stack trace.

| Method and path | Request | Response | Notes |
|---|---|---|---|
| `GET /api/health` | | `{ ok, paypal, gemini, groq, mode }` | Booleans say whether each key is configured, never the keys |
| `GET /api/health/inspector` | | `{ ok, ms, title, counts }` | Loads our own fixed demo page in headless Chromium to prove the browser works on the host |
| `GET /api/config` | | `{ paypalClientId, environment }` | Client ID is public by design |
| `POST /api/paypal/client-token` | | `{ clientToken }` | Browser-safe SDK v6 token (`response_type=client_token`), bound to the request host |
| `POST /api/scope/compile` | `{ brief (20..4000 chars), price (50..10000), clientName?, freelancerName? }` | `S` | Groq then Gemini fallback. Output validated, amounts normalized |
| `POST /api/milestones/:mid/order` | `S` | `{ orderId }` | Creates an Orders v2 order, `intent: AUTHORIZE`, amount taken from signed state |
| `POST /api/milestones/:mid/authorize` | `S + { orderId }` | `S` | Authorizes the approved order and checks the amount equals the milestone amount |
| `POST /api/milestones/:mid/inspect` | `S + { url }` | `S + { report }` | `report` holds screenshots (base64 JPEG) and per-check details; it is not signed and not trusted later |
| `POST /api/milestones/:mid/settle` | `S` | `S + { capture? }` | Captures `passedAmount - alreadyCaptured(PayPal)`. `final_capture` is true when every criterion has passed |
| `POST /api/milestones/:mid/void` | `S` | `S` | Voids the authorization (no delivery by the deadline, or release of the unpaid remainder) |
| `POST /api/milestones/:mid/review` | `S + { criterionId, decision: approve or reject }` | `S + { capture? }` | Client resolves a criterion held for review. Approval is captured from the authorization immediately |
| `POST /api/milestones/:mid/refund` | `S + { criterionId }` | `S` | Refunds a paid criterion's amount from its capture (client contest outcome) |
| `GET /api/paypal/orders/:id` | | `{ status, authorizations[], captures[] }` | Live PayPal read used by the ledger's "verify with PayPal" button |

## 5. Data flow (one milestone)

1. Client submits a brief. Compiler returns milestones and criteria. Server signs the project.
2. Client clicks "Secure with PayPal". The SDK v6 session calls `/order`, PayPal shows its approval popup, and `onApprove` calls `/authorize`. Status becomes `funded`. Nobody has been charged.
3. Freelancer submits a URL. `/inspect` validates the URL (SSRF rules below), opens it in headless Chromium at 1440x900 and 390x844, collects facts, runs the injection guard, runs deterministic checks, then sends the screenshots and page text (wrapped as untrusted data) to Gemini for the remaining criteria. Verdicts with confidence under 0.6 are marked `needsReview` and are not paid automatically.
4. `/settle` reads the order from PayPal, computes the delta, and captures it with `final_capture` set correctly. The ledger shows capture ID, gross, PayPal fee and net.
5. Criteria held for review (confidence under 0.6, or a frozen manipulation attempt) wait for the client, who approves (captured at once) or rejects (stays held).
6. Freelancer fixes failures and resubmits. Re-inspection pays only newly passed criteria. When all pass, the final capture closes the authorization.
7. If the deadline passes, `/void` voids the authorization and releases whatever was not captured.

## 6. Security boundaries

- PayPal secret, Gemini key, Groq key and `STATE_SECRET` live only in server env vars. The browser gets only the PayPal client ID and short-lived client tokens.
- Capture amounts are computed on the server from signed verdicts, capped by PayPal's authorized amount minus PayPal's captured total, so replaying an old state cannot over-capture.
- **SSRF:** submitted URLs must be `http(s)`, ports 80/443, no credentials, and resolve only to public addresses (IPv6 forms embedding IPv4 are judged by the IPv4 they carry). The headless browser runs behind a local egress proxy (`server/egress.ts`): every connection it makes, including redirects, subresources, workers and WebSockets, is resolved and checked at connect time and opened to that exact IP, so DNS rebinding has no window. Loopback is forced through the proxy; QUIC and non-proxied WebRTC are disabled. Local addresses are allowed only when `ALLOW_LOCAL_URLS=1` (local development).
- **Prompt injection:** page content is passed to Gemini inside a delimited untrusted block with an instruction that it is evidence, never instructions. Pattern rules scan every text segment (visible, hidden, comments, attributes); Prompt Guard scores the 10 most suspicious, reviewer-directed and hidden text first, so padding cannot push an instruction out of range. If injection is detected, AI judgment is not used and every criterion that would otherwise pass (deterministic ones included) is frozen as `needsReview`, so nothing is captured until the client approves or rejects it. Deterministic checks still report their findings as evidence.
- Request limits: JSON bodies up to 200 KB, brief up to 4000 chars, best-effort per-IP rate limit on AI endpoints (per serverless instance).
- CORS: same origin only (API and app are served from one domain).

## 7. External services and limits

| Service | Use | Limit and handling |
|---|---|---|
| PayPal sandbox REST | OAuth, Orders v2, Payments v2 | Token cached in memory until 60 s before expiry. Errors return PayPal's `debug_id` |
| PayPal JS SDK v6 | Buyer approval | Sandbox script `https://www.sandbox.paypal.com/web-sdk/v6/core` |
| Groq (free tier) | Scope compiler, Prompt Guard | Rate limited. On failure the compiler falls back to Gemini and the guard falls back to heuristics only |
| Gemini (free tier) | Visual and content judging | Rate limited. On failure, AI-judged criteria become `needsReview` and only deterministic results can trigger payment |
| Headless Chromium | Inspector | `@sparticuz/chromium` on Vercel, local Chrome otherwise. 25 s navigation timeout, 95 s budget for a whole inspection |
| Vercel Hobby | Hosting | Functions up to 300 s and 2 GB. API max duration set to 120 s |

## 8. Background jobs

N/A. Deadlines are demonstrated with an explicit "deadline passed" action; a production version would run a scheduled job that voids expired authorizations.

## 9. Error handling summary

Every route is wrapped; failures return a short message and code. PayPal failures include `debugId`. AI failures degrade to "needs review" rather than paying or blocking on a guess. Browser failures (timeout, DNS, blocked URL) return a clear reason and change no money state.
