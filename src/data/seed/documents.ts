// Living documents seed (docs/documents.md §6). Fictional.
import type { CommsPlanRow, DocSection, DocumentKind, ProjectDocument, RaciOverride, Requirement, Stakeholder } from '@/domain/types';

const T = (d: string) => `${d}T10:00:00Z`;
const TODAY = '2026-11-16';
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

const narrative = (id: string, title: string, body: string): DocSection => ({ id, title, kind: 'narrative', body });
const live = (id: string, title: string, source: NonNullable<DocSection['live']>['source']): DocSection => ({ id, title, kind: 'live', live: { source } });

export const TEMPLATES: Record<DocumentKind, (text: Record<string, string>) => DocSection[]> = {
  charter: (t) => [
    narrative('purpose', 'Purpose', t.purpose ?? ''),
    narrative('objectives', 'Objectives', t.objectives ?? ''),
    narrative('scope', 'Scope (in / out)', t.scope ?? ''),
    live('sponsor', 'Sponsor & approvers', 'sponsor'),
    live('milestones', 'Milestones & stage gates', 'milestones'),
    live('budget', 'Budget by workstream', 'budget'),
    live('team', 'Team', 'team'),
    live('risks', 'Top risks', 'top_risks'),
    narrative('constraints', 'Assumptions & constraints', t.constraints ?? ''),
    narrative('success', 'Success criteria', t.success ?? ''),
  ],
  brd: (t) => [narrative('context', 'Business context', t.context ?? ''), live('requirements', 'Requirements & traceability', 'requirements'), narrative('glossary', 'Glossary', t.glossary ?? '')],
  raci: (t) => [narrative('notes', 'How to read this matrix', t.notes ?? ''), live('raci', 'RACI matrix', 'raci')],
  stakeholders: (t) => [narrative('approach', 'Engagement approach', t.approach ?? ''), live('register', 'Stakeholder register', 'stakeholders'), live('comms', 'Communication plan', 'comms_plan')],
};

const doc = (
  id: string,
  programId: string,
  kind: DocumentKind,
  title: string,
  text: Record<string, string>,
  o: { approverIds: string[]; ownerId: string; state: ProjectDocument['state']; version: number; approvedVersion?: number; attachments?: ProjectDocument['attachments']; approvals?: ProjectDocument['approvals'] },
): ProjectDocument => ({
  id,
  programId,
  kind,
  title,
  ownerId: o.ownerId,
  approverIds: o.approverIds,
  sharedWithGuestIds: [],
  sections: TEMPLATES[kind](text),
  state: o.state,
  version: o.version,
  approvals: o.approvals ?? [],
  ...(o.approvedVersion ? { approvedVersion: o.approvedVersion } : {}),
  attachments: o.attachments ?? [],
  createdAt: T('2026-03-02'),
  updatedAt: T('2026-10-01'),
});

export function documentsSeed() {
  const titan = 'prg_titan';
  const lumen = 'prg_lumen';
  const documents: ProjectDocument[] = [
    doc('doc_titan_charter', titan, 'charter', 'Titan-1 Project Charter', {
      purpose: 'Build and commission Titan-1, a 48 MW high-performance computing facility with 2,048 GPU nodes, to give the Research Compute Consortium dedicated AI training capacity from Q4 2027.',
      objectives: '1. Energize the facility (G2) by 2027-04-14.\n2. Reach mechanical completion (G3) with liquid cooling at design load.\n3. Pass the integrated systems test (G4) and customer acceptance (G5) by 2027-12-18.\n4. Deliver within the $250M budget (EAC within ±3%).',
      scope: 'In scope: site and civil works, power (utility interconnect, substation, MV distribution, backup), cooling plant and liquid cooling, network fabric, compute and storage procurement, rack & stack, software stack, commissioning, security, operations readiness.\nOut of scope: ongoing operations after handover, tenant applications, the second-phase expansion (Halls E–H).',
      constraints: 'Six-day construction week. Utility energization depends on the utility’s line extension. GPU allocation follows the master supply agreement. All dates in the milestone table are live from the plan.',
      success: 'Customer acceptance signed by 2027-12-18; EAC within ±3% of $250M; zero lost-time incidents; PUE ≤ 1.2 at design load within 90 days of go-live.',
    }, {
      approverIds: ['per_jordan', 'per_alex'],
      ownerId: 'per_alex',
      state: 'approved',
      version: 3,
      approvedVersion: 3,
      approvals: [
        { personId: 'per_alex', decision: 'approve', at: T('2026-10-01') },
        { personId: 'per_jordan', decision: 'approve', at: T('2026-10-02') },
      ],
      attachments: [{ id: 'att_1', name: 'Titan-1 charter v3 (signed).pdf', mime: 'application/pdf', sizeBytes: 412_000, addedById: 'per_alex', addedAt: T('2026-10-02') }],
    }),
    doc('doc_titan_brd', titan, 'brd', 'Titan-1 Business Requirements (BRD)', {
      context: 'The Research Compute Consortium needs dedicated GPU capacity for large-model training with predictable availability, security controls suitable for regulated research data, and a facility that can scale to a second phase.',
      glossary: 'AHJ: authority having jurisdiction (fire marshal, building department). IST: integrated systems test. PUE: power usage effectiveness. CDU: coolant distribution unit.',
    }, { approverIds: ['per_alex', 'per_jordan'], ownerId: 'per_alex', state: 'approved', version: 2, approvedVersion: 2 }),
    doc('doc_titan_raci', titan, 'raci', 'Titan-1 RACI Matrix', {
      notes: 'R = responsible (does the work), A = accountable (one per deliverable, signs off), C = consulted, I = informed. Cells are derived from the plan (owners, driving workstreams, gate approvers); edited cells are marked.',
    }, { approverIds: ['per_alex', 'per_priya'], ownerId: 'per_alex', state: 'in_review', version: 1 }),
    doc('doc_titan_stakeholders', titan, 'stakeholders', 'Titan-1 Stakeholder & Communication Plan', {
      approach: 'Manage closely the stakeholders with high influence and high interest (sponsor, customer, utility). Keep the authorities and suppliers informed on a fixed cadence. Every communication below has an owner and a next date.',
    }, { approverIds: ['per_alex'], ownerId: 'per_alex', state: 'approved', version: 1, approvedVersion: 1 }),
    doc('doc_lumen_charter', lumen, 'charter', 'Lumen AI Launch Charter', {
      purpose: 'Launch the Lumen AI platform publicly with self-serve sign-up, usage-based pricing and SOC 2 Type I assurance.',
      objectives: '1. Public launch on the committed date.\n2. SOC 2 Type I report before launch.\n3. 99.9% API availability in launch month.',
      scope: 'In scope: inference and fine-tuning APIs, web app, billing, evaluation suite, second region, docs and launch marketing.\nOut of scope: on-premise deployment, enterprise SSO beyond SAML.',
      constraints: 'Sprint capacity is fixed through launch; scope moves, not people.',
      success: 'Launch on date; 1,000 developer sign-ups in week one; p95 latency under 800 ms.',
    }, { approverIds: ['per_jordan', 'per_alex'], ownerId: 'per_alex', state: 'approved', version: 1, approvedVersion: 1 }),
    doc('doc_lumen_brd', lumen, 'brd', 'Lumen AI Product Requirements', {
      context: 'Developers need a reliable model API with transparent pricing; enterprises need security assurance before adopting it.',
      glossary: 'LoRA: low-rank adaptation for fine-tuning. SLO: service level objective.',
    }, { approverIds: ['per_alex'], ownerId: 'per_alex', state: 'approved', version: 1, approvedVersion: 1 }),
  ];

  const t = (k: string) => `itm_titan_${k}`;
  const l = (k: string) => `itm_lumen_${k}`;
  const req = (programId: string, documentId: string, code: string, statement: string, priority: Requirement['priority'], traced: string[], status: Requirement['status'] = 'approved', ownerId?: string): Requirement => ({
    id: `req_${code.toLowerCase().replace('-', '_')}_${programId.slice(4)}`,
    programId,
    documentId,
    code,
    statement,
    priority,
    status,
    tracedItemIds: traced,
    ...(ownerId ? { ownerId } : {}),
  });
  const B = 'doc_titan_brd';
  const requirements: Requirement[] = [
    req(titan, B, 'BR-001', 'Deliver 2,048 GPU nodes across four data halls', 'must', [t('gpu1'), t('gpu2'), t('gpu3'), t('gpu4')], 'in_delivery'),
    req(titan, B, 'BR-002', 'Support 48 MW IT load with N+1 backup power', 'must', [t('g2'), t('gen_loadbank')], 'in_delivery', 'per_priya'),
    req(titan, B, 'BR-003', 'Remove ≥ 80% of heat with liquid cooling at design load', 'must', [t('g3'), t('tab')], 'in_delivery'),
    req(titan, B, 'BR-004', 'Non-blocking network fabric across all halls', 'must', [t('fabric_accept')]),
    req(titan, B, 'BR-005', 'Two diverse carrier circuits', 'must', [t('carriers')], 'in_delivery'),
    req(titan, B, 'BR-006', 'Parallel storage ≥ 20 PB usable', 'must', [t('storage'), t('storage_recv')]),
    req(titan, B, 'BR-007', 'Integrated systems test before go-live', 'must', [t('l5'), t('g4')]),
    req(titan, B, 'BR-008', 'Security controls ready for SOC 2 at go-live', 'must', [t('soc2_ready'), t('audit')], 'in_delivery'),
    req(titan, B, 'BR-009', 'Badge access and mantraps in every hall', 'must', [t('access_ctl'), t('readers_a'), t('readers_b'), t('readers_c'), t('readers_d')]),
    req(titan, B, 'BR-010', 'Operations staffed 24×7 at go-live', 'must', [t('noc_hire'), t('orr')], 'in_delivery'),
    req(titan, B, 'BR-011', 'Runbooks for every critical system', 'must', [t('runbooks')]),
    req(titan, B, 'BR-012', 'Disaster recovery plan, tested', 'should', [t('dr_plan')]),
    req(titan, B, 'BR-013', 'On-site spare parts depot', 'should', [t('depot')]),
    req(titan, B, 'BR-014', 'Hall C fabric ready before GPU batch 3 arrives', 'must', [t('optics_c')]),
    req(titan, B, 'BR-015', 'Clean-agent fire suppression in all halls', 'must', [t('fire_a'), t('fire_b'), t('fire_c'), t('fire_d')], 'in_delivery'),
    req(titan, B, 'BR-016', 'Revenue-grade energy metering', 'must', [t('metering')]),
    req(titan, B, 'BR-017', 'Job scheduler and bare-metal provisioning', 'must', [t('story2'), t('story5')], 'in_delivery'),
    req(titan, B, 'BR-018', 'Monitoring and alerting into the NOC', 'should', [t('monitoring')]),
    req(titan, B, 'BR-019', 'Customer acceptance test plan agreed', 'must', [t('cust_accept')]),
    req(titan, B, 'BR-020', 'Compliance sign-off before handover', 'must', [t('compliance_ok')]),
    req(titan, B, 'BR-021', 'Vendor support contracts in place', 'must', [t('support')]),
    req(titan, B, 'BR-022', 'PUE ≤ 1.2 at design load', 'could', []),
    req(titan, B, 'BR-023', 'Heat-reuse study for district heating', 'could', [], 'proposed'),
    req(titan, B, 'BR-024', 'Final account agreed at handover', 'must', [t('g5')]),
    ...[
      ['PR-001', 'Streaming responses from the inference API', [l('lmp_301')]],
      ['PR-002', 'Autoscaling holds p95 latency under 800 ms', [l('lmp_302'), l('lmp_320')]],
      ['PR-003', 'Usage-based billing with invoices', [l('lwa_122'), l('lwa_123'), l('lmp_312')]],
      ['PR-004', 'SOC 2 Type I report before launch', [l('soc2_report')]],
      ['PR-005', 'Second region with tested failover', [l('region2'), l('failover')]],
      ['PR-006', 'Developer docs for every public API', [l('docs')]],
      ['PR-007', 'Evaluation dashboard v2', [l('lmp_eval_dash1'), l('lmp_eval_dash2'), l('lmp_eval_dash3')]],
      ['PR-008', 'SAML SSO for workspaces', [l('lwa_130')]],
    ].map(([code, s, tr]) => req(lumen, 'doc_lumen_brd', code as string, s as string, 'must', tr as string[])),
  ];

  const sh = (id: string, programId: string, o: Omit<Stakeholder, 'id' | 'programId'>): Stakeholder => ({ id, programId, ...o });
  const stakeholders: Stakeholder[] = [
    sh('stk_1', titan, { personId: 'per_jordan', role: 'Sponsor', influence: 5, interest: 5, attitude: 'champion' }),
    sh('stk_2', titan, { name: 'Dr. Elena Varga', org: 'Research Compute Consortium', role: 'Customer lead', influence: 5, interest: 5, attitude: 'supporter' }),
    sh('stk_3', titan, { name: 'Dana Fox', org: 'Gridline Power (utility)', role: 'Key-account manager', influence: 5, interest: 3, attitude: 'neutral' }),
    sh('stk_4', titan, { name: 'Morgan Reyes', org: 'County building department (AHJ)', role: 'Inspector', influence: 4, interest: 2, attitude: 'neutral' }),
    sh('stk_5', titan, { name: 'Patrick Moss', org: 'Keel Corp finance', role: 'CFO office', influence: 4, interest: 3, attitude: 'skeptic' }),
    sh('stk_6', titan, { personId: 'per_chris', role: 'Switchgear supplier', influence: 3, interest: 4, attitude: 'supporter' }),
    sh('stk_7', titan, { personId: 'per_priya', role: 'Power lead', influence: 4, interest: 5, attitude: 'champion' }),
    sh('stk_8', titan, { name: 'Riverside community board', org: 'Local community', role: 'Neighbors', influence: 2, interest: 3, attitude: 'skeptic' }),
  ];
  const cm = (id: string, o: Omit<CommsPlanRow, 'id' | 'programId'>): CommsPlanRow => ({ id, programId: titan, ...o });
  const comms: CommsPlanRow[] = [
    cm('com_1', { audience: 'Steering committee (sponsor, customer, finance)', message: 'Program status, decisions needed, budget and EVM', channel: 'meeting', cadence: 'monthly', ownerId: 'per_alex', nextDue: addDays(TODAY, 3) }),
    cm('com_2', { audience: 'All workstream leads', message: 'Weekly status report', channel: 'report', cadence: 'weekly', ownerId: 'per_alex', nextDue: addDays(TODAY, 4) }),
    cm('com_3', { audience: 'Gridline Power', message: 'Interconnect and energization coordination', channel: 'meeting', cadence: 'weekly', ownerId: 'per_priya', nextDue: addDays(TODAY, 1) }),
    cm('com_4', { audience: 'Key suppliers (VoltGrid, Northwind, Apex)', message: 'Supplier performance and delivery review', channel: 'meeting', cadence: 'biweekly', ownerId: 'per_priya', nextDue: addDays(TODAY, 9) }),
    cm('com_5', { audience: 'County building department', message: 'Inspection look-ahead', channel: 'email', cadence: 'monthly', ownerId: 'per_alex', nextDue: addDays(TODAY, 12) }),
    cm('com_6', { audience: 'Whole site team', message: 'Safety and progress all-hands', channel: 'keel', cadence: 'monthly', ownerId: 'per_alex', nextDue: addDays(TODAY, 16) }),
  ];

  // One RACI row deliberately has no "A" (flagged by validation).
  const raciOverrides: RaciOverride[] = [{ documentId: 'doc_titan_raci', itemId: 'itm_titan_g4', personId: '__owner__', letters: ['R'] }];

  return { documents, requirements, stakeholders, comms, raciOverrides };
}
