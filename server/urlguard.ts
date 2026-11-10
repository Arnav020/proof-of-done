import dns from 'node:dns/promises';
import net from 'node:net';
import { env } from './env.js';
import { ApiError } from './errors.js';

function v4ToInt(ip: string) {
  return ip.split('.').reduce((a, o) => (a << 8) + Number(o), 0) >>> 0;
}
const V4_BLOCKS: [string, number][] = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 4], ['240.0.0.0', 4],
];

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const n = v4ToInt(ip);
    return V4_BLOCKS.some(([base, bits]) => (n >>> (32 - bits)) === (v4ToInt(base) >>> (32 - bits)));
  }
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    const mapped = l.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    return l === '::1' || l === '::' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe8') || l.startsWith('fe9') || l.startsWith('fea') || l.startsWith('feb');
  }
  return true;
}

const hostCache = new Map<string, boolean>();

/** True if the host resolves only to public addresses (or local URLs are allowed in dev). */
export async function hostAllowed(hostname: string): Promise<boolean> {
  if (env.allowLocalUrls) return true;
  const h = hostname.replace(/^\[|\]$/g, '');
  if (hostCache.has(h)) return hostCache.get(h)!;
  let ok: boolean;
  if (net.isIP(h)) ok = !isPrivateIp(h);
  else if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal')) ok = false;
  else {
    try {
      const addrs = await dns.lookup(h, { all: true });
      ok = addrs.length > 0 && addrs.every((a) => !isPrivateIp(a.address));
    } catch {
      ok = false;
    }
  }
  hostCache.set(h, ok);
  return ok;
}

export async function validateUrl(raw: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new ApiError(400, 'URL_INVALID', 'That is not a valid URL.');
  }
  if (!['http:', 'https:'].includes(u.protocol)) throw new ApiError(400, 'URL_PROTOCOL', 'Only http and https links can be inspected.');
  if (u.username || u.password) throw new ApiError(400, 'URL_CREDENTIALS', 'Links with embedded credentials are not allowed.');
  if (!env.allowLocalUrls && u.port && !['80', '443'].includes(u.port)) throw new ApiError(400, 'URL_PORT', 'Only standard web ports are allowed.');
  if (!(await hostAllowed(u.hostname))) throw new ApiError(400, 'URL_BLOCKED', 'That address is private or unreachable, so it cannot be inspected.');
  return u;
}
