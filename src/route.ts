export type View = 'landing' | 'app';

/** Maps a URL hash to a screen. Returns null for in-page anchors (#how, #root) so they never switch screens. */
export function routeOf(hash: string): View | null {
  if (hash.startsWith('#/app')) return 'app';
  if (hash === '' || hash === '#' || hash.startsWith('#/')) return 'landing';
  return null;
}
