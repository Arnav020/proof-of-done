/** Smoke check for the food bank sample: real compile, then the Inspector on its three demo deliveries (no money moves). */
import { buildProject, compileScope } from '../server/compiler.js';
import { inspectMilestone } from '../server/inspector.js';
import { SAMPLES } from './demo-data.js';

const base = process.argv[2] ?? 'http://localhost:5173';
const s = SAMPLES.find((x) => x.id === 'foodbank')!;
for (let run = 1; run <= Number(process.env.RUNS ?? 1); run++) {
  const { plan, model } = await compileScope(s.brief);
  const p = buildProject(plan, { brief: s.brief, price: s.price, clientName: s.clientName, freelancerName: s.freelancerName });
  console.log(`\nRUN ${run}: ${model}, ${p.milestones.length} milestones: ${p.milestones.map((m) => `${m.title} $${m.amount} (${m.criteria.length})`).join(' | ')}`);
  const jobs: [string, string, number][] = [['v1', s.deliveries[0][0].path, 0], ['v2', s.deliveries[0][1].path, 0], ['volunteer', s.deliveries[1][0].path, 1]];
  for (const [label, path, mi] of jobs) {
    const r = await inspectMilestone(p.milestones[mi], base + path, p.brief);
    const pass = r.details.filter((d) => d.pass).length;
    console.log(`  == ${label}: ${pass}/${r.details.length} pass, injection=${r.injection.flagged}`);
    for (const d of r.details.filter((d) => !d.pass)) console.log(`     FAIL [${d.source}] ${d.title}: ${d.evidence.slice(0, 110)}`);
  }
}
