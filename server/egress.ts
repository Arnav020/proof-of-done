import http from 'node:http';
import net from 'node:net';
import type { AddressInfo } from 'node:net';
import { ALLOWED_PORTS, resolvePublic } from './urlguard.js';

/**
 * Egress filter for the headless browser. Chromium is started with --proxy-server pointing here, so EVERY
 * connection it makes (pages, subresources, redirects, web workers, service workers, WebSockets) passes through
 * this proxy. The target host is resolved and checked at connect time and the socket is opened to that exact IP,
 * which closes DNS rebinding: there is no gap between the check and the connection.
 */
export type Egress = { url: string; close: () => Promise<void>; blocked: string[] };

async function target(host: string, port: number): Promise<string | null> {
  if (!ALLOWED_PORTS.has(port)) return null;
  return resolvePublic(host);
}

export async function startEgressProxy(): Promise<Egress> {
  const blocked: string[] = [];
  const server = http.createServer(async (req, res) => {
    // Plain http: the request line carries an absolute URL.
    let u: URL;
    try {
      u = new URL(req.url ?? '');
    } catch {
      res.writeHead(400).end();
      return;
    }
    const port = Number(u.port || 80);
    const ip = await target(u.hostname, port);
    if (!ip || u.protocol !== 'http:') {
      blocked.push(`${u.hostname}:${port}`);
      res.writeHead(403).end('blocked by Proof of Done egress filter');
      return;
    }
    const upstream = http.request(
      { host: ip, port, method: req.method, path: `${u.pathname}${u.search}`, headers: { ...req.headers, host: u.host }, timeout: 20000 },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers);
        up.pipe(res);
      },
    );
    upstream.on('error', () => res.headersSent ? res.destroy() : res.writeHead(502).end());
    upstream.on('timeout', () => upstream.destroy());
    req.pipe(upstream);
  });

  // https and wss use CONNECT host:port.
  server.on('connect', async (req, client, head) => {
    client.on('error', () => client.destroy());
    const m = (req.url ?? '').match(/^\[?([^\]]+?)\]?:(\d+)$/);
    const host = m?.[1] ?? '';
    const port = Number(m?.[2] ?? 0);
    const ip = m ? await target(host, port) : null;
    if (!ip) {
      blocked.push(`${host}:${port}`);
      client.end('HTTP/1.1 403 Forbidden\r\n\r\n');
      return;
    }
    const up = net.connect({ host: ip, port, timeout: 20000 }, () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head?.length) up.write(head);
      up.pipe(client);
      client.pipe(up);
    });
    up.on('error', () => client.destroy());
    up.on('timeout', () => up.destroy());
  });
  server.on('clientError', (_e, socket) => socket.destroy());

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    blocked,
    close: () => new Promise((resolve) => {
      server.closeAllConnections?.();
      server.close(() => resolve());
    }),
  };
}
