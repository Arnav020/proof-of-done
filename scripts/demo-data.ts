/**
 * Seeded sample projects (fictional organisations and people). Each shows a different kind of client, deliverable
 * structure and failure path, and ships with demo deliveries hosted under public/demo-sites.
 */
export type SampleDelivery = { label: string; path: string };
export type Sample = {
  id: 'bakery' | 'foodbank';
  title: string;
  audience: string;
  story: string;
  brief: string;
  price: number;
  clientName: string;
  freelancerName: string;
  /** Demo deliveries per milestone index (0-based). */
  deliveries: SampleDelivery[][];
};

export const DEMO_BRIEF = `Website for Larkhill Loaves, a small neighbourhood sourdough bakery in Brookvale. Three deliverables:
1) Homepage: shows the bakery name, an image of bread, our opening hours, our address (14 Larkhill Road), a phone number customers can tap to call, and it must look right on phones with no sideways scrolling.
2) Menu page: lists our breads and pastries, each with a price in dollars, clearly marks which items are vegan, and uses a warm, friendly tone.
3) Pre-order page: a form where customers enter their name, email, pickup date and what they want, and a clear note about when orders must be placed.`;

export const DEMO_PRICE = 600;

export const FOODBANK_BRIEF = `Donation campaign for Riverbend Food Share, a volunteer-run community food bank. Two deliverables:
1) Campaign page: states our goal of raising $12,000 for winter food boxes, shows how much has been raised so far, has a clear Donate button, explains what a donation buys (for example $25 feeds a family for a week), every image has descriptive alt text for screen reader users, and it reads well on phones.
2) Volunteer sign-up page: a form asking for name, email and which days the person can help, every form field has a visible label, and a short note explaining how we use their email.`;

export const FOODBANK_PRICE = 840;

export const SAMPLES: Sample[] = [
  {
    id: 'bakery',
    title: 'Bakery website',
    audience: 'Small business',
    story: 'A neighbourhood bakery hires a freelance web developer for three pages. The first draft fails, the fix is paid, and one page tries to cheat the AI reviewer.',
    brief: DEMO_BRIEF,
    price: DEMO_PRICE,
    clientName: 'Larkhill Loaves',
    freelancerName: 'Riya, freelance web developer',
    deliveries: [
      [{ label: 'First draft', path: '/demo-sites/larkhill-v1/index.html' }, { label: 'Fixed version', path: '/demo-sites/larkhill-v2/index.html' }],
      [{ label: 'Menu page', path: '/demo-sites/larkhill-menu/index.html' }],
      [],
    ],
  },
  {
    id: 'foodbank',
    title: 'Food bank campaign',
    audience: 'Nonprofit',
    story: 'A volunteer-run food bank hires a freelance designer for a donation campaign. Accessibility gaps block payment until fixed; the volunteer form passes first time.',
    brief: FOODBANK_BRIEF,
    price: FOODBANK_PRICE,
    clientName: 'Riverbend Food Share',
    freelancerName: 'Tomás, freelance designer',
    deliveries: [
      [{ label: 'First draft', path: '/demo-sites/riverbend-campaign-v1/index.html' }, { label: 'Accessible version', path: '/demo-sites/riverbend-campaign-v2/index.html' }],
      [{ label: 'Volunteer page', path: '/demo-sites/riverbend-volunteer/index.html' }],
    ],
  },
];

export const SAMPLE_IDS = SAMPLES.map((s) => s.id);

/** Kept for the e2e/slice scripts. */
export const DEMO_SITES = {
  homepagePartial: '/demo-sites/larkhill-v1/index.html',
  homepageFixed: '/demo-sites/larkhill-v2/index.html',
  menuInjected: '/demo-sites/larkhill-menu/index.html',
};
