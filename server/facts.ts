/** Everything the Inspector learns about a page, gathered once and reused by code checks, the guard and the AI judge. */
export type PageFacts = {
  url: string;
  finalUrl: string;
  status: number;
  https: boolean;
  title: string;
  lang: string;
  viewportMeta: boolean;
  headings: string[];
  visibleText: string;
  hiddenText: string[];
  comments: string[];
  attrText: string[];
  counts: {
    form: number;
    email_input: number;
    phone_link: number;
    image: number;
    button: number;
    nav: number;
    footer: number;
    map: number;
    links: number;
  };
  imagesMissingAlt: number;
  loadMs: number;
  mobileOverflowPx: number;
  consoleErrors: number;
};

/**
 * Runs inside the page (serialized by puppeteer). Must be self-contained.
 * Collects visible text plus text that a human cannot see (hidden, zero-size, same colour,
 * off-screen, HTML comments, alt/aria/meta) because that is where reviewer-directed injections hide.
 */
export function collectInPage() {
  const doc = document;
  const isHidden = (el: Element): boolean => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) < 0.05) return true;
    if (parseFloat(s.fontSize) < 3) return true;
    const r = (el as HTMLElement).getBoundingClientRect();
    if ((r.width < 2 || r.height < 2) && (el.textContent ?? '').trim().length > 0 && s.overflow === 'hidden') return true;
    if (r.right < -500 || r.bottom < -500 || r.left > 10000) return true;
    if (s.clipPath && s.clipPath !== 'none' && s.clipPath.includes('inset(50%')) return true;
    if (s.color && s.color === s.backgroundColor && s.color !== 'rgba(0, 0, 0, 0)') return true;
    return false;
  };
  const hidden: string[] = [];
  doc.querySelectorAll('body *').forEach((el) => {
    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'PATH'].includes(el.tagName.toUpperCase())) return;
    const own = Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => (n.textContent ?? '').trim())
      .join(' ')
      .trim();
    if (own.length >= 12 && isHidden(el)) hidden.push(own.slice(0, 600));
  });
  const comments: string[] = [];
  const walker = doc.createTreeWalker(doc.documentElement, NodeFilter.SHOW_COMMENT);
  while (walker.nextNode()) {
    const t = (walker.currentNode.textContent ?? '').trim();
    if (t.length >= 12) comments.push(t.slice(0, 600));
  }
  const attrText: string[] = [];
  doc.querySelectorAll('[alt],[aria-label],[title],meta[name="description"],meta[name="keywords"]').forEach((el) => {
    for (const a of ['alt', 'aria-label', 'title', 'content']) {
      const v = el.getAttribute(a);
      if (v && v.trim().length >= 20) attrText.push(v.trim().slice(0, 400));
    }
  });
  const imgs = Array.from(doc.images);
  // Inline SVG illustrations count as images when they are meaningfully large or declared as images.
  const svgs = Array.from(doc.querySelectorAll('svg')).filter((s) => {
    const r = s.getBoundingClientRect();
    return s.getAttribute('role') === 'img' || (r.width >= 120 && r.height >= 80);
  });
  const svgMissingAlt = svgs.filter((s) => s.getAttribute('aria-hidden') !== 'true' && !(s.getAttribute('aria-label') ?? '').trim() && !s.querySelector('title')).length;
  const svgDecorativeOnly = svgs.filter((s) => s.getAttribute('aria-hidden') === 'true').length;
  const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  return {
    title: doc.title,
    lang: doc.documentElement.lang,
    viewportMeta: !!doc.querySelector('meta[name="viewport"]'),
    headings: Array.from(doc.querySelectorAll('h1,h2,h3')).map((h) => (h.textContent ?? '').trim()).filter(Boolean).slice(0, 30),
    visibleText: (doc.body?.innerText ?? '').replace(/\n{3,}/g, '\n\n').slice(0, 8000),
    hiddenText: hidden.slice(0, 20),
    comments: comments.slice(0, 20),
    attrText: attrText.slice(0, 30),
    counts: {
      form: doc.querySelectorAll('form').length,
      email_input: doc.querySelectorAll('input[type="email"]').length,
      phone_link: doc.querySelectorAll('a[href^="tel:"]').length,
      image: imgs.filter((i) => i.naturalWidth > 1).length + svgs.length + doc.querySelectorAll('[style*="background-image"]').length,
      // Links styled as buttons (filled background and padding) count too: "Donate" and "Book now" are usually links.
      button: new Set([
        ...Array.from(doc.querySelectorAll('button, input[type="submit"], input[type="button"], a[role="button"], .btn, .button')),
        ...Array.from(doc.querySelectorAll('a[href]')).filter((a) => {
          const s = getComputedStyle(a);
          const filled = s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent';
          return filled && parseFloat(s.paddingLeft) >= 8 && parseFloat(s.paddingTop) >= 4 && (a.textContent ?? '').trim().length <= 40;
        }),
      ]).size,
      nav: doc.querySelectorAll('nav, [role="navigation"]').length,
      footer: doc.querySelectorAll('footer, [role="contentinfo"]').length,
      map: doc.querySelectorAll('iframe[src*="map"], [class*="map" i], [id*="map" i]').length,
      links: doc.querySelectorAll('a[href]').length,
    },
    // aria-hidden SVGs are decorative by declaration but give no text alternative, so they count as missing alt.
    imagesMissingAlt: imgs.filter((i) => !(i.getAttribute('alt') ?? '').trim()).length + svgMissingAlt + svgDecorativeOnly,
    loadMs: nav ? Math.round(nav.loadEventEnd || nav.domContentLoadedEventEnd) : 0,
  };
}
