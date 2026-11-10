import type { PageFacts } from './facts.js';
import type { CheckSpec } from './types.js';

const ELEMENT_LABEL: Record<string, string> = {
  form: 'form', email_input: 'email field', phone_link: 'tap-to-call phone link', image: 'image',
  button: 'button', nav: 'navigation bar', footer: 'footer', map: 'map',
};

/** Pure, deterministic checks. The AI can never override these results. */
export function runCheck(check: CheckSpec, f: PageFacts): { pass: boolean; evidence: string } {
  switch (check.op) {
    case 'text_present': {
      const hay = `${f.title}\n${f.visibleText}`.toLowerCase();
      const hit = check.any.find((p) => hay.includes(p.toLowerCase()));
      return hit
        ? { pass: true, evidence: `Found "${hit}" in the visible page text.` }
        : { pass: false, evidence: `None of ${check.any.map((p) => `"${p}"`).join(', ')} appear in the visible page text.` };
    }
    case 'element_present': {
      const min = check.min ?? 1;
      const n = f.counts[check.element] ?? 0;
      const label = ELEMENT_LABEL[check.element] ?? check.element;
      return n >= min
        ? { pass: true, evidence: `Found ${n} ${label}${n === 1 ? '' : 's'} (needed ${min}).` }
        : { pass: false, evidence: `Found ${n} ${label}${n === 1 ? '' : 's'}, needed at least ${min}.` };
    }
    case 'mobile_no_horizontal_scroll':
      return f.mobileOverflowPx <= 2
        ? { pass: true, evidence: 'At 390px width the page fits the screen with no sideways scrolling.' }
        : { pass: false, evidence: `At 390px width the page is ${f.mobileOverflowPx}px wider than the screen, so it scrolls sideways.` };
    case 'load_time_under':
      return f.loadMs > 0 && f.loadMs <= check.ms
        ? { pass: true, evidence: `Page loaded in ${f.loadMs} ms (limit ${check.ms} ms).` }
        : { pass: false, evidence: `Page load took ${f.loadMs || 'unknown'} ms (limit ${check.ms} ms).` };
    case 'viewport_meta':
      return f.viewportMeta
        ? { pass: true, evidence: 'A responsive viewport meta tag is present.' }
        : { pass: false, evidence: 'No viewport meta tag, so phones will render a zoomed-out desktop page.' };
    case 'images_have_alt':
      return f.imagesMissingAlt === 0
        ? { pass: true, evidence: f.counts.image ? `All ${f.counts.image} images have alt text.` : 'The page has no images, so none are missing alt text.' }
        : { pass: false, evidence: `${f.imagesMissingAlt} image(s) have no alt text.` };
    case 'title_contains': {
      const hit = check.any.find((p) => f.title.toLowerCase().includes(p.toLowerCase()));
      return hit
        ? { pass: true, evidence: `Page title "${f.title}" contains "${hit}".` }
        : { pass: false, evidence: `Page title "${f.title}" does not contain ${check.any.map((p) => `"${p}"`).join(' or ')}.` };
    }
  }
}
