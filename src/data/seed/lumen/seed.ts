// Lumen AI: AI SaaS platform public launch (docs/demo-scenarios.md, Program B). Fictional.
// Agile workstreams (sprints, Jira-mirrored) on a milestone backbone. Generator time: today = 2026-11-16.
import { WorkCalendar } from '@/domain/calendar';
import { addDays } from '@/domain/dates';
import type { PlanState } from '@/domain/plan';
import { schedule } from '@/domain/scheduling/schedule';
import type { Calendar, Channel, Item, Membership, Message, Milestone, Person, Program, Relation, Risk, Sprint, Task, Workstream } from '@/domain/types';

export const LUMEN_ID = 'prg_lumen';
const P = LUMEN_ID;
const TODAY = '2026-11-16';
const T = (d: string, t = '10:00') => `${d}T${t}:00Z`;

export const lumenCalendar: Calendar = {
  id: 'cal_lumen',
  name: 'Lumen AI (Mon–Fri)',
  workWeek: [true, true, true, true, true, false, false],
  holidays: ['2026-05-25', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25', '2027-01-01', '2027-05-31'],
};

export const lumenProgram: Program = {
  id: P,
  name: 'Lumen AI',
  code: 'LUMEN',
  description: 'AI SaaS platform public launch: agile workstreams on a milestone backbone.',
  start: '2026-05-11',
  calendarId: lumenCalendar.id,
  currency: 'USD',
  checkinCadence: { weekday: 1, enabled: true },
  budgetCents: 0,
};

const WS = {
  platform: 'wst_lumen_platform',
  webapp: 'wst_lumen_webapp',
  data: 'wst_lumen_data',
  infra: 'wst_lumen_infra',
  gtm: 'wst_lumen_gtm',
} as const;

export const lumenWorkstreams: Workstream[] = [
  { id: WS.platform, programId: P, name: 'Model Platform', mode: 'agile', leadId: 'per_noor_haddad', color: '#6d5bd0', budgetCents: 0, order: 0, jiraBoard: { key: 'LMP', url: 'https://lumen.atlassian.example/jira/software/projects/LMP' } },
  { id: WS.webapp, programId: P, name: 'Product & Web App', mode: 'agile', leadId: 'per_ines_moreau', color: '#1f5fbf', budgetCents: 0, order: 1, jiraBoard: { key: 'LWA', url: 'https://lumen.atlassian.example/jira/software/projects/LWA' } },
  { id: WS.data, programId: P, name: 'Data & Evaluation', mode: 'agile', leadId: 'per_kofi_asante', color: '#0f7b6c', budgetCents: 0, order: 2 },
  { id: WS.infra, programId: P, name: 'Infra & Security', mode: 'scheduled', leadId: 'per_priya', color: '#55657a', budgetCents: 0, order: 3 },
  { id: WS.gtm, programId: P, name: 'Go-to-Market', mode: 'scheduled', leadId: 'per_lea_fischer', color: '#b4541a', budgetCents: 0, order: 4 },
];

// ── Team ─────────────────────────────
const TEAM: [id: string, name: string, title: string, ws: keyof typeof WS | null, role: Membership['role']][] = [
  ['per_noor_haddad', 'Noor Haddad', 'Platform Lead', 'platform', 'lead'],
  ['per_ines_moreau', 'Inès Moreau', 'Product Lead', 'webapp', 'lead'],
  ['per_kofi_asante', 'Kofi Asante', 'Evaluation Lead', 'data', 'lead'],
  ['per_lea_fischer', 'Lea Fischer', 'Head of Marketing', 'gtm', 'lead'],
  ['per_ravi_menon', 'Ravi Menon', 'ML Engineer', 'platform', 'member'],
  ['per_julia_santos', 'Julia Santos', 'ML Engineer', 'platform', 'member'],
  ['per_tom_becker', 'Tom Becker', 'Platform Engineer', 'platform', 'member'],
  ['per_hye_jin_park', 'Hye-jin Park', 'Frontend Engineer', 'webapp', 'member'],
  ['per_marco_bianchi', 'Marco Bianchi', 'Full-stack Engineer', 'webapp', 'member'],
  ['per_ada_nwosu', 'Ada Nwosu', 'Product Designer', 'webapp', 'member'],
  ['per_lukas_novak', 'Lukas Novák', 'Billing Engineer', 'webapp', 'member'],
  ['per_mira_sato', 'Mira Sato', 'Data Scientist', 'data', 'member'],
  ['per_owen_clarke', 'Owen Clarke', 'Data Engineer', 'data', 'member'],
  ['per_fatima_zahra', 'Fatima Zahra', 'Red-team Engineer', 'data', 'member'],
  ['per_ben_osei', 'Ben Osei', 'Security Engineer', 'infra', 'member'],
  ['per_clara_lind', 'Clara Lind', 'SRE', 'infra', 'member'],
  ['per_dev_patel', 'Dev Patel', 'Compliance Manager', 'infra', 'member'],
  ['per_sara_cohen', 'Sara Cohen', 'Technical Writer', 'gtm', 'member'],
  ['per_luis_ortega', 'Luis Ortega', 'Partner Manager', 'gtm', 'member'],
  ['per_emma_walsh', 'Emma Walsh', 'Pricing Analyst', 'gtm', 'member'],
  ['per_yusuf_kaya', 'Yusuf Kaya', 'Developer Advocate', 'gtm', 'member'],
];
const COLORS = ['#6d5bd0', '#1f5fbf', '#0f7b6c', '#b4541a', '#8a4baf', '#2b8fbf', '#a3532c', '#3c8c5a'];

export function lumenTeam(): { people: Person[]; memberships: Membership[] } {
  const people: Person[] = TEAM.map(([id, name, title], i) => ({
    id,
    name,
    email: `${name.toLowerCase().normalize('NFD').replace(/[^a-z ]/g, '').replace(' ', '.')}@lumen.example`,
    title,
    org: 'Lumen AI',
    avatarColor: COLORS[i % COLORS.length]!,
    home: (['slack', 'keel', 'slack', 'email'] as const)[i % 4]!,
  }));
  const memberships: Membership[] = [
    { programId: P, personId: 'per_alex', role: 'pm', workstreamIds: [] },
    { programId: P, personId: 'per_priya', role: 'lead', workstreamIds: [WS.infra] },
    { programId: P, personId: 'per_sam', role: 'member', workstreamIds: [WS.platform] },
    { programId: P, personId: 'per_jordan', role: 'exec', workstreamIds: [] },
    ...TEAM.map(([id, , , ws, role]) => ({ programId: P, personId: id, role, workstreamIds: ws ? [WS[ws]] : [] })),
  ];
  return { people, memberships };
}

// ── Items ─────────────────────────────
const base = { programId: P, sharedWithGuestIds: [] as string[], followerIds: [] as string[], createdAt: T('2026-05-11'), updatedAt: T('2026-11-13') };
let order = 0;

function story(key: string, jira: string | undefined, ws: string, title: string, points: number, status: Task['status'], owner: string, sprintId?: string): Task {
  return {
    ...base,
    id: `itm_lumen_${key}`,
    workstreamId: ws,
    order: ++order,
    type: 'task',
    title,
    status,
    ownerId: owner,
    durationHalfDays: 2,
    percentComplete: status === 'done' ? 100 : status === 'in_progress' ? 50 : 0,
    assignments: [{ personId: owner, allocationPct: 100 }],
    storyPoints: points,
    ...(sprintId ? { sprintId } : {}),
    ...(jira ? { externalRef: { system: 'jira' as const, key: jira, url: `https://lumen.atlassian.example/browse/${jira}` } } : {}),
  };
}

function task(key: string, ws: string, title: string, days: number, status: Task['status'], owner: string, extra: Partial<Task> = {}): Task {
  return {
    ...base,
    id: `itm_lumen_${key}`,
    workstreamId: ws,
    order: ++order,
    type: 'task',
    title,
    status,
    ownerId: owner,
    durationHalfDays: days * 2,
    percentComplete: status === 'done' ? 100 : status === 'in_progress' ? 40 : 0,
    assignments: [{ personId: owner, allocationPct: 100 }],
    ...extra,
  };
}

function milestone(key: string, ws: string, title: string, owner: string, extra: Partial<Milestone> = {}): Milestone {
  return { ...base, id: `itm_lumen_${key}`, workstreamId: ws, order: ++order, type: 'milestone', title, status: 'not_started', ownerId: owner, durationHalfDays: 0, percentComplete: 0, assignments: [], ...extra };
}

/** 2-week sprints ending on Fridays; sprint 14 is active in the seed week. */
function sprints(ws: string, prefix: string, completed: number[], active: { committed: number; remaining: number[] }): Sprint[] {
  const out: Sprint[] = [];
  const s14 = '2026-11-09';
  const n = completed.length + 1;
  for (let i = 0; i < n; i++) {
    const start = addDays(s14, -14 * (n - 1 - i));
    const end = addDays(start, 11);
    const isActive = i === n - 1;
    out.push({
      id: `spr_${prefix}_${i + 1}`,
      workstreamId: ws,
      name: `Sprint ${i + 1}`,
      start,
      end,
      state: isActive ? 'active' : 'closed',
      committedPoints: isActive ? active.committed : Math.max(completed[i]! + (i % 3 === 0 ? 4 : 2), completed[i]!),
      ...(isActive ? {} : { completedPoints: completed[i]! }),
      burndown: isActive ? active.remaining.map((r, d) => ({ date: addDays(start, d < 5 ? d : d + 2), remainingPoints: r })) : [],
    });
  }
  return out;
}

export interface LumenSeed {
  people: Person[];
  memberships: Membership[];
  items: Item[];
  relations: Relation[];
  sprints: Sprint[];
  channels: Channel[];
  messages: Message[];
}

export const LUMEN_IDS = {
  launch: 'itm_lumen_launch',
  soc2: 'itm_lumen_soc2_report',
  readiness: 'itm_lumen_readiness',
  activeSprint: 'spr_lmp_14',
  evalDashboard: ['itm_lumen_lmp_eval_dash1', 'itm_lumen_lmp_eval_dash2', 'itm_lumen_lmp_eval_dash3'],
  platformChannel: 'chn_lumen_platform',
  securityChannel: 'chn_lumen_security',
};

export function lumenSeed(): LumenSeed {
  order = 0;
  const { people, memberships } = lumenTeam();
  const S = (ws: 'lmp' | 'lwa' | 'lde') => `spr_${ws}_14`;

  // Model Platform (LMP): sprint 14 = 40 pts, 18 done (22 remaining); backlog 110 pts.
  const platform: Task[] = [
    story('lmp_301', 'LMP-301', WS.platform, 'Streaming responses in the inference API', 8, 'done', 'per_ravi_menon', S('lmp')),
    story('lmp_302', 'LMP-302', WS.platform, 'Autoscaling for the GPU inference pool', 8, 'in_progress', 'per_tom_becker', S('lmp')),
    story('lmp_303', 'LMP-303', WS.platform, 'Retries for fine-tuning jobs', 5, 'done', 'per_julia_santos', S('lmp')),
    story('lmp_304', 'LMP-304', WS.platform, 'Eval harness: regression gates in CI', 5, 'done', 'per_sam', S('lmp')),
    story('lmp_305', 'LMP-305', WS.platform, 'Model registry permissions', 5, 'in_progress', 'per_ravi_menon', S('lmp')),
    story('lmp_306', 'LMP-306', WS.platform, 'Batch inference API', 9, 'not_started', 'per_tom_becker', S('lmp')),
    story('lmp_310', 'LMP-310', WS.platform, 'Multi-tenant rate limiting', 13, 'not_started', 'per_tom_becker'),
    story('lmp_311', 'LMP-311', WS.platform, 'Fine-tuning API: LoRA adapters', 8, 'not_started', 'per_julia_santos'),
    story('lmp_312', 'LMP-312', WS.platform, 'Usage metering events', 8, 'not_started', 'per_ravi_menon'),
    story('lmp_313', 'LMP-313', WS.platform, 'Inference cold-start under 2 s', 13, 'not_started', 'per_sam'),
    story('lmp_314', 'LMP-314', WS.platform, 'Content safety filter v2', 8, 'not_started', 'per_julia_santos'),
    story('lmp_315', 'LMP-315', WS.platform, 'Model versioning & rollback', 5, 'not_started', 'per_sam'),
    story('lmp_316', 'LMP-316', WS.platform, 'Embeddings endpoint', 8, 'not_started', 'per_ravi_menon'),
    story('lmp_317', 'LMP-317', WS.platform, 'Regional failover for inference', 13, 'not_started', 'per_tom_becker'),
    story('lmp_318', 'LMP-318', WS.platform, 'SLO dashboards & alerts', 8, 'not_started', 'per_sam'),
    story('lmp_319', 'LMP-319', WS.platform, 'API keys: scopes & rotation', 5, 'not_started', 'per_julia_santos'),
    story('lmp_320', 'LMP-320', WS.platform, 'Load test at 3× launch traffic', 8, 'not_started', 'per_tom_becker'),
    story('lmp_eval_dash1', 'LMP-330', WS.platform, 'Eval dashboard v2: per-customer views', 5, 'not_started', 'per_sam'),
    story('lmp_eval_dash2', 'LMP-331', WS.platform, 'Eval dashboard v2: drift alerts', 5, 'not_started', 'per_sam'),
    story('lmp_eval_dash3', 'LMP-332', WS.platform, 'Eval dashboard v2: export to CSV', 3, 'not_started', 'per_ravi_menon'),
  ];
  // Product & Web App (LWA): sprint 14 = 30 pts, 13 done; backlog 40.
  const webapp: Task[] = [
    story('lwa_120', 'LWA-120', WS.webapp, 'Onboarding checklist', 5, 'done', 'per_hye_jin_park', S('lwa')),
    story('lwa_121', 'LWA-121', WS.webapp, 'Workspace invitations', 8, 'done', 'per_marco_bianchi', S('lwa')),
    story('lwa_122', 'LWA-122', WS.webapp, 'Billing: usage meter', 8, 'in_progress', 'per_lukas_novak', S('lwa')),
    story('lwa_123', 'LWA-123', WS.webapp, 'Billing: invoices page', 5, 'not_started', 'per_lukas_novak', S('lwa')),
    story('lwa_124', 'LWA-124', WS.webapp, 'Playground: prompt history', 4, 'in_progress', 'per_hye_jin_park', S('lwa')),
    story('lwa_130', 'LWA-130', WS.webapp, 'SSO (SAML) for workspaces', 8, 'not_started', 'per_marco_bianchi'),
    story('lwa_131', 'LWA-131', WS.webapp, 'Team roles & permissions', 8, 'not_started', 'per_marco_bianchi'),
    story('lwa_132', 'LWA-132', WS.webapp, 'Pricing page & checkout', 5, 'not_started', 'per_lukas_novak'),
    story('lwa_133', 'LWA-133', WS.webapp, 'API key management UI', 8, 'not_started', 'per_hye_jin_park'),
    story('lwa_134', 'LWA-134', WS.webapp, 'Accessibility pass (WCAG AA)', 5, 'not_started', 'per_ada_nwosu'),
    story('lwa_135', 'LWA-135', WS.webapp, 'Empty states & first-run tips', 6, 'not_started', 'per_ada_nwosu'),
  ];
  // Data & Evaluation: sprint 14 = 24 pts, 14 done; backlog 30.
  const data: Task[] = [
    story('lde_60', undefined, WS.data, 'Red-team suite: jailbreak set v3', 8, 'done', 'per_fatima_zahra', S('lde')),
    story('lde_61', undefined, WS.data, 'Eval dataset: code generation', 6, 'done', 'per_mira_sato', S('lde')),
    story('lde_62', undefined, WS.data, 'Hallucination benchmark refresh', 5, 'in_progress', 'per_mira_sato', S('lde')),
    story('lde_63', undefined, WS.data, 'Quality dashboard: weekly trend', 5, 'not_started', 'per_owen_clarke', S('lde')),
    story('lde_70', undefined, WS.data, 'Multilingual eval set', 8, 'not_started', 'per_mira_sato'),
    story('lde_71', undefined, WS.data, 'Safety eval sign-off process', 5, 'not_started', 'per_fatima_zahra'),
    story('lde_72', undefined, WS.data, 'Data retention policy implementation', 8, 'not_started', 'per_owen_clarke'),
    story('lde_73', undefined, WS.data, 'Customer eval report template', 9, 'not_started', 'per_kofi_asante'),
  ];

  // Scheduled workstreams + backbone
  const infra: Item[] = [
    task('soc2_readiness', WS.infra, 'SOC 2 readiness assessment', 15, 'done', 'per_dev_patel', { snet: '2026-07-06' }),
    task('soc2_policies', WS.infra, 'Security policies & training', 15, 'done', 'per_dev_patel'),
    task('soc2_evidence', WS.infra, 'Control evidence collection', 20, 'in_progress', 'per_dev_patel', { snet: '2026-10-26' }),
    task('pentest', WS.infra, 'Third-party penetration test', 8, 'not_started', 'per_ben_osei', { snet: '2026-11-23' }),
    task('remediation', WS.infra, 'Pen test remediation', 6, 'not_started', 'per_ben_osei'),
    task('audit_fieldwork', WS.infra, 'SOC 2 audit fieldwork', 8, 'not_started', 'per_dev_patel'),
    milestone('soc2_report', WS.infra, 'SOC 2 Type I report', 'per_priya'),
    task('region2', WS.infra, 'Second region build-out', 20, 'in_progress', 'per_clara_lind', { snet: '2026-11-02' }),
    task('failover', WS.infra, 'Failover game day', 4, 'not_started', 'per_clara_lind'),
  ];
  const gtm: Item[] = [
    milestone('private_beta', WS.gtm, 'Private beta', 'per_lea_fischer', { pinned: { start: '2026-09-14' }, status: 'done', percentComplete: 100 }),
    task('pricing', WS.gtm, 'Pricing & packaging', 12, 'in_progress', 'per_emma_walsh', { snet: '2026-11-02' }),
    task('docs', WS.gtm, 'Developer docs site', 25, 'in_progress', 'per_sara_cohen', { snet: '2026-10-26' }),
    task('partners', WS.gtm, 'Launch partner announcements', 10, 'not_started', 'per_luis_ortega', { snet: '2026-12-07' }),
    task('launch_event', WS.gtm, 'Launch event & keynote prep', 15, 'not_started', 'per_yusuf_kaya', { snet: '2026-12-01' }),
    task('readiness', WS.gtm, 'Launch readiness review', 3, 'not_started', 'per_alex'),
    milestone('launch', WS.gtm, 'Public launch', 'per_lea_fischer'),
  ];

  const risk = (k: string, ws: string, title: string, description: string, impact: Risk['impact'], probability: Risk['probability'], mitigation: string, contingency: string, owner: string, code: string): Risk => ({
    ...base,
    id: `itm_lumen_${k}`,
    workstreamId: ws,
    order: 900 + ++order,
    type: 'risk',
    code,
    title,
    description,
    status: 'in_progress',
    impact,
    probability,
    mitigation,
    contingency,
    ownerId: owner,
  });
  const risks: Risk[] = [
    risk('risk_capacity', WS.platform, 'GPU inference capacity short at launch', 'Launch-week traffic could exceed the reserved GPU pool and degrade latency for paying customers.', 4, 3, 'Load test at 3× expected traffic; reserved capacity contract; autoscaling tuned before launch.', 'Waitlist new sign-ups and burst to a second cloud region at on-demand prices.', 'per_noor_haddad', 'L-01'),
    risk('risk_auditor', WS.infra, 'SOC 2 auditor availability', 'The audit firm’s fieldwork calendar is full in December; a slip delays the Type I report enterprise buyers ask for.', 3, 3, 'Fieldwork dates booked; evidence collected continuously in the compliance tool.', 'Launch with a bridge letter from the auditor and deliver the report shortly after.', 'per_dev_patel', 'L-02'),
    risk('risk_quality', WS.data, 'Model quality regression before launch', 'A late model update could regress quality on code or multilingual tasks without being caught.', 4, 2, 'Regression gates in CI on the eval harness; frozen launch model two weeks out.', 'Roll back to the previous model version via the registry and ship the update post-launch.', 'per_kofi_asante', 'L-03'),
    risk('risk_pricing', WS.gtm, 'Pricing not final in time for launch', 'Enterprise and usage tiers still have open questions; late pricing blocks the pricing page and sales collateral.', 3, 3, 'Pricing decision meeting scheduled; two options modelled with finance.', 'Launch with self-serve pricing only and “contact sales” for enterprise.', 'per_emma_walsh', 'L-04'),
  ];

  const items: Item[] = [...platform, ...webapp, ...data, ...infra, ...gtm, ...risks];
  const id = (k: string) => `itm_lumen_${k}`;
  let r = 0;
  const rel = (from: string, to: string, kind: 'FS' | 'SS' = 'FS', lagDays = 0): Relation => ({ id: `rel_lumen_${++r}`, programId: P, kind, fromId: from, toId: to, lagHalfDays: lagDays * 2 });
  const relations: Relation[] = [
    rel(id('soc2_readiness'), id('soc2_policies')),
    rel(id('soc2_policies'), id('soc2_evidence')),
    rel(id('soc2_evidence'), id('audit_fieldwork')),
    rel(id('pentest'), id('remediation')),
    rel(id('remediation'), id('audit_fieldwork')),
    rel(id('audit_fieldwork'), id('soc2_report')),
    rel(id('region2'), id('failover')),
    rel(WS.platform, id('readiness')),
    rel(WS.webapp, id('readiness')),
    rel(WS.data, id('readiness')),
    rel(id('soc2_report'), id('readiness')),
    rel(id('failover'), id('readiness')),
    rel(id('docs'), id('readiness')),
    rel(id('pricing'), id('readiness')),
    rel(id('launch_event'), id('readiness')),
    rel(id('partners'), id('launch'), 'FS', -3),
    rel(id('readiness'), id('launch')),
  ];

  const allSprints: Sprint[] = [
    ...sprints(WS.platform, 'lmp', [24, 27, 30, 31, 33, 34, 36, 35, 37, 39, 40, 42, 38], { committed: 40, remaining: [40, 37, 32, 29, 26, 22] }),
    ...sprints(WS.webapp, 'lwa', [18, 20, 22, 24, 25, 26, 27, 28, 29, 30, 31, 29, 30], { committed: 30, remaining: [30, 28, 25, 21, 19, 17] }),
    ...sprints(WS.data, 'lde', [14, 16, 18, 19, 20, 21, 22, 23, 24, 25, 26, 24, 25], { committed: 24, remaining: [24, 22, 19, 16, 13, 10] }),
  ];

  // Deadlines with deliberate slack: Public launch +6 working days, SOC 2 report +8.
  const plan: PlanState = { program: lumenProgram, calendar: lumenCalendar, workstreams: lumenWorkstreams, items, relations, sprints: allSprints, costEntries: [], asOf: TODAY };
  const res = schedule(plan);
  const cal = new WorkCalendar(lumenCalendar, lumenProgram.start);
  for (const [key, slack] of [['launch', 6], ['soc2_report', 8]] as const) {
    const m = items.find((i) => i.id === id(key)) as Milestone;
    m.deadline = cal.addWorkingDays(res.nodes.get(m.id)!.es, slack);
  }

  const channels: Channel[] = [
    { id: 'chn_lumen_general', programId: P, name: 'lumen-launch' },
    { id: LUMEN_IDS.platformChannel, programId: P, workstreamId: WS.platform, name: 'lumen-platform', bridge: { system: 'slack', externalName: '#lumen-platform' } },
    { id: LUMEN_IDS.securityChannel, programId: P, workstreamId: WS.infra, name: 'security', bridge: { system: 'teams', externalName: 'Lumen › Security' } },
  ];
  const msg = (k: string, channel: string, author: string, source: Message['source'], at: string, body: string): Message => ({
    id: `msg_lumen_${k}`,
    programId: P,
    container: { kind: 'channel', id: channel },
    source,
    authorId: author,
    body,
    mentions: [],
    createdAt: at,
    visibility: 'members',
  });
  const messages: Message[] = [
    msg('g1', 'chn_lumen_general', 'per_lea_fischer', 'keel', T('2026-11-12', '09:30'), 'Keynote venue is confirmed. Partner announcements go out three days before launch.'),
    msg('g2', 'chn_lumen_general', 'per_alex', 'keel', T('2026-11-13', '16:05'), 'Reminder: launch readiness review is the gate. Every workstream brings its go/no-go.'),
    msg('p1', LUMEN_IDS.platformChannel, 'per_noor_haddad', 'slack', T('2026-11-10', '11:12'), 'Sprint 14 planned at 40 points. Batch inference (LMP-306) is the stretch item.'),
    msg('p2', LUMEN_IDS.platformChannel, 'per_tom_becker', 'slack', T('2026-11-12', '15:40'), 'Autoscaling PR is up. Load test environment is flaky though, might lose a day.'),
    msg('p3', LUMEN_IDS.platformChannel, undefined as unknown as string, 'jira', T('2026-11-13', '18:00'), 'LMP-304 “Eval harness: regression gates in CI” moved to Done.'),
    msg('s1', LUMEN_IDS.securityChannel, 'per_ben_osei', 'teams', T('2026-11-11', '10:20'), 'Pen test vendor confirmed for the week of 2026-11-23. Scope: API gateway, web app, model endpoints.'),
    msg('s2', LUMEN_IDS.securityChannel, 'per_dev_patel', 'teams', T('2026-11-13', '14:00'), 'Evidence collection is at 70%. Auditor fieldwork is booked right after remediation.'),
  ];
  messages[4]!.authorId = undefined;

  return { people, memberships, items, relations, sprints: allSprints, channels, messages };
}
