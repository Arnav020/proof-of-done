import type { PageFacts } from '../server/facts';
import type { Milestone } from '../server/types';

export const facts = (over: Partial<PageFacts> = {}): PageFacts => ({
  url: 'https://example.com/',
  finalUrl: 'https://example.com/',
  status: 200,
  https: true,
  title: 'Larkhill Loaves | Sourdough bakery',
  lang: 'en',
  viewportMeta: true,
  headings: ['Slow bread for a fast street.'],
  visibleText: 'Larkhill Loaves. Opening hours: Tue to Fri 7am to 3pm. 14 Larkhill Road.',
  hiddenText: [],
  comments: [],
  attrText: [],
  counts: { form: 0, email_input: 0, phone_link: 1, image: 1, button: 1, nav: 1, footer: 1, map: 0, links: 4 },
  imagesMissingAlt: 0,
  loadMs: 420,
  mobileOverflowPx: 0,
  consoleErrors: 0,
  ...over,
});

export const milestone = (verdicts: (boolean | 'review' | undefined)[], amounts = [30, 30, 40]): Milestone => ({
  id: 'm1',
  index: 0,
  title: 'Homepage',
  summary: 'Homepage',
  amount: amounts.reduce((a, b) => a + b, 0),
  startOffsetDays: 0,
  durationDays: 5,
  dueAt: new Date().toISOString(),
  status: 'funded',
  criteria: amounts.map((amount, i) => ({
    id: `m1c${i + 1}`,
    title: `c${i + 1}`,
    description: 'd',
    kind: 'deterministic',
    amount,
    paid: false,
    verdict:
      verdicts[i] === undefined
        ? undefined
        : { pass: verdicts[i] === true, confidence: 1, evidence: '', source: 'code', needsReview: verdicts[i] === 'review', at: '' },
  })),
  payment: { orderId: 'ORDER123456789', authorizationId: 'AUTH123', authorizedAmount: amounts.reduce((a, b) => a + b, 0), captured: 0, captures: [], refunds: [] },
});
