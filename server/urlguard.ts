import dns from 'node:dns/promises';
import net from 'node:net';
import { env } from './env.js';
import { ApiError } from './errors.js';

const V4_BLOCKS: [string, number][] = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
];
const v4ToInt = (ip: string) => ip.split('.').reduce((a, o) => (a << 8) + Number(o), 0) >>> 0;

function v4Private(ip: string): boolean {
  const n = v4ToInt(ip);
  return V4_BLOCKS.some(([base, bits]) => n >>> (32 - bits) === v4ToInt(base) >>> (32 - bits));
}

/** Expands any IPv6 text form (including embedded dotted IPv4) into 16 bytes. */
function v6Bytes(ip: string): number[] | null {
  let s = ip.toLowerCase().split('%')[0];
  const dotted = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const n = v4ToInt(dotted[1]);
    s = s.slice(0, -dotted[1].length) + `${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const [head, tail] = s.split('::');
  const h = head ? head.split(':') : [];
  const t = tail !== undefined ? (tail ? tail.split(':') : []) : null;
  const groups = t === null ? h : [...h, ...Array(8 - h.length - t.length).fill('0'), ...t];
  if (groups.length !== 8) return null;
  return groups.flatMap((g) => {
    const v = parseInt(g || '0', 16);
    return [(v >> 8) & 0xff, v & 0xff];
  });
}

const bytesToV4 = (b: number[]) => b.join('.');

/**
 * True for any address a server-side fetch must never reach. IPv6 forms that embed an IPv4 address
 * (mapped ::ffff:0:0/96, compatible ::/96, NAT64 64:ff9b::/96, 6to4 2002::/16) are judged by the IPv4 they carry,
 * so "[::ffff:a9fe:a9fe]" (169.254.169.254) is blocked. Found by an independent review.
 */
export function isPrivateIp(ip: string): boolean {
  const addr = ip.replace(/^\[|\]$/g, '');
  if (net.isIPv4(addr)) return v4Private(addr);
  if (!net.isIPv6(addr)) return true;
  const b = v6Bytes(addr);
  if (!b) return true;
  const zero = (from: number, to: number) => b.slice(from, to).every((x) => x === 0);
  if (zero(0, 10) && b[10] === 0xff && b[11] === 0xff) return v4Private(bytesToV4(b.slice(12)));
  if (zero(0, 12)) return zero(12, 15) && (b[15] === 0 || b[15] === 1) ? true : v4Private(bytesToV4(b.slice(12)));
  if (b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b && zero(4, 12)) return v4Private(bytesToV4(b.slice(12)));
  if (b[0] === 0x20 && b[1] === 0x02) return v4Private(bytesToV4(b.slice(2, 6)));
  if ((b[0] & 0xfe) === 0xfc) return true; // unique local fc00::/7
  if (b[0] === 0xfe && (b[1] & 0xc0) === 0x80) return true; // link local fe80::/10
  if (b[0] === 0xff) return true; // multicast
  return false;
}

/** Resolves a host and returns one public address to connect to, or null if any answer is private. No caching. */
export async function resolvePublic(hostname: string): Promise<string | null> {
  const h = hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(h)) return isPrivateIp(h) ? null : h;
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal')) return null;
  try {
    const addrs = await dns.lookup(h, { all: true, verbatim: true });
    if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) return null;
    return addrs[0].address;
  } catch {
    return null;
  }
}

export const ALLOWED_PORTS = new Set([80, 443]);

export async function validateUrl(raw: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new ApiError(400, 'URL_INVALID', 'That is not a valid URL.');
  }
  if (!['http:', 'https:'].includes(u.protocol)) throw new ApiError(400, 'URL_PROTOCOL', 'Only http and https links can be inspected.');
  if (u.username || u.password) throw new ApiError(400, 'URL_CREDENTIALS', 'Links with embedded credentials are not allowed.');
  if (env.allowLocalUrls) return u;
  if (u.port && !ALLOWED_PORTS.has(Number(u.port))) throw new ApiError(400, 'URL_PORT', 'Only standard web ports are allowed.');
  if (!(await resolvePublic(u.hostname))) throw new ApiError(400, 'URL_BLOCKED', 'That address is private or unreachable, so it cannot be inspected.');
  return u;
}
