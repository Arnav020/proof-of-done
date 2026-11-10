import crypto from 'node:crypto';
import { env } from './env.js';
import { ApiError } from './errors.js';
import type { Milestone, Project, Signed } from './types.js';

/** Deterministic JSON: object keys sorted, so the same project always signs the same way. */
export function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
    .join(',')}}`;
}

export function sign(project: Project, secret = env.stateSecret): string {
  return crypto.createHmac('sha256', secret).update(canonical(project)).digest('base64url');
}

export function wrap(project: Project): Signed {
  return { project, sig: sign(project) };
}

export function unwrap(body: unknown): Project {
  const b = body as Partial<Signed> | undefined;
  if (!b || typeof b !== 'object' || !b.project || typeof b.sig !== 'string') {
    throw new ApiError(400, 'STATE_MISSING', 'Project state is missing.');
  }
  const expected = Buffer.from(sign(b.project));
  const got = Buffer.from(b.sig);
  if (expected.length !== got.length || !crypto.timingSafeEqual(expected, got)) {
    throw new ApiError(403, 'STATE_TAMPERED', 'Project state signature is invalid. Start a new project.');
  }
  return structuredClone(b.project);
}

export function findMilestone(p: Project, id: string): Milestone {
  const m = p.milestones.find((x) => x.id === id);
  if (!m) throw new ApiError(404, 'MILESTONE_NOT_FOUND', 'Milestone not found.');
  return m;
}
