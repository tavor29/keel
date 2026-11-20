// Regenerates src/data/seed/titan/titan-1.xml from the Titan-1 plan definition.
// Run: npm run seed:titan   (a test fails if the committed XML is out of date)
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { exportMspdi } from '@/domain/io/mspdi';
import { computeRag } from '@/domain/rag';
import { schedule } from '@/domain/scheduling/schedule';
import { buildTitan } from '@/data/seed/titan/plan';

const titan = buildTitan();
const result = schedule(titan);
const xml = exportMspdi({ plan: titan, result, people: titan.team.people });
const out = fileURLToPath(new URL('../src/data/seed/titan/titan-1.xml', import.meta.url));
writeFileSync(out, xml + '\n');

const rag = computeRag(titan, result);
const leaves = titan.items.filter((i) => !titan.items.some((c) => c.parentId === i.id));
console.log(`items ${titan.items.length} (leaves ${leaves.length}), relations ${titan.relations.length}, people ${titan.team.people.length}`);
console.log(`project finish ${result.projectFinish}; warnings ${result.warnings.length}`);
for (const id of ['g0', 'g1', 'g2', 'g3', 'g4', 'g5']) {
  const item = titan.items.find((i) => i.id === `itm_titan_${id}`)!;
  const n = result.nodes.get(item.id)!;
  console.log(`${item.title.padEnd(32)} ${n.es}  float ${(n.totalFloatHalfDays / 2).toString().padStart(5)}d  deadline ${'deadline' in item ? item.deadline : '-'}  ${rag.items.get(item.id)}`);
}
for (const [id, p] of result.procurement) console.log(`  ${id.padEnd(22)} delivery ${p.delivery} needBy ${p.needBy} float ${p.floatDays}d`);
console.log('workstream RAG', Object.fromEntries([...rag.workstreams].map(([k, v]) => [k.replace('wst_titan_', ''), v])), 'program', rag.program);
console.log(`wrote ${out} (${(xml.length / 1024).toFixed(0)} KB)`);
