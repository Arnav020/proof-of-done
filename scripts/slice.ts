/** Vertical-slice smoke run (no money moves): compile the demo brief, then inspect the three demo sites. */
import { buildProject, compileScope } from '../server/compiler.js';
import { inspectMilestone } from '../server/inspector.js';
import { DEMO_BRIEF, DEMO_PRICE, DEMO_SITES } from './demo-data.js';

const base = process.argv[2] ?? 'http://localhost:5173';
const t0 = Date.now();
const { plan, model } = await compileScope(DEMO_BRIEF);
const p = buildProject(plan, { brief: DEMO_BRIEF, price: DEMO_PRICE, clientName: 'Larkhill Loaves', freelancerName: 'Riya' });
console.log(`compiled by ${model} in ${Date.now() - t0} ms: ${p.milestones.length} milestones`);
for (const m of p.milestones) {
  console.log(`\n${m.id} ${m.title} $${m.amount}`);
  for (const c of m.criteria) console.log(`  ${c.id} [${c.kind}${c.check ? ' ' + c.check.op : ''}] $${c.amount} ${c.title}`);
}
for (const [label, path, mi] of [['v1', DEMO_SITES.homepagePartial, 0], ['v2', DEMO_SITES.homepageFixed, 0], ['menu', DEMO_SITES.menuInjected, 1]] as const) {
  const r = await inspectMilestone(p.milestones[mi], base + path, p.brief);
  console.log(`\n== ${label} (${r.durationMs} ms, models ${r.models.join(',') || '-'}) injection=${r.injection.flagged} ${r.injection.method} guard=${r.injection.guardScore?.toFixed(3)} ${r.injection.where ?? ''}`);
  for (const d of r.details) console.log(`  ${d.pass ? 'PASS' : 'FAIL'} ${d.needsReview ? '(review) ' : ''}[${d.source}] ${d.title}: ${d.evidence.slice(0, 140)}`);
  if (r.aiError) console.log('  aiError:', r.aiError);
}
