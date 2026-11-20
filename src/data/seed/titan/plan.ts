// Titan-1: HPC data center build (docs/demo-scenarios.md, Program A).
// Fictional. Generated into titan-1.xml by scripts/generate-titan.ts.
import { WorkCalendar } from '@/domain/calendar';
import { isTask, type PlanState } from '@/domain/plan';
import { schedule } from '@/domain/scheduling/schedule';
import type { Calendar, Item, Program, Workstream } from '@/domain/types';
import { PlanBuilder, type Dep } from '../builder';
import { TITAN_WS as WS, titanTeam, type TitanWsKey } from './people';

export const TITAN_PROGRAM_ID = 'prg_titan';
/** The generator's "today". The demo shifts all dates so this lands on the visitor's current week. */
export const TITAN_AS_OF = '2026-11-16';
export const TITAN_START = '2026-03-02';
export const HALLS = ['A', 'B', 'C', 'D'] as const;
const ROWS = 12;

export const titanCalendar: Calendar = {
  id: 'cal_titan',
  name: 'Titan-1 site (Mon–Sat)',
  workWeek: [true, true, true, true, true, true, false],
  holidays: ['2026-05-25', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25', '2027-01-01', '2027-05-31', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24'],
};

const WS_META: [TitanWsKey, string, Workstream['mode'], number, string][] = [
  ['site', 'Site & Civil', 'scheduled', 12, '#7a6a55'],
  ['power', 'Power', 'scheduled', 35, '#c98a00'],
  ['cooling', 'Cooling', 'scheduled', 25, '#2b8fbf'],
  ['network', 'Network', 'scheduled', 15, '#6d5bd0'],
  ['compute', 'Compute Procurement', 'scheduled', 150, '#1f5fbf'],
  ['rack', 'Rack & Stack', 'scheduled', 4, '#3c8c5a'],
  ['software', 'Software Stack', 'agile', 3, '#b0457b'],
  ['commissioning', 'Commissioning', 'scheduled', 3, '#a3532c'],
  ['security', 'Security & Compliance', 'scheduled', 1.5, '#55657a'],
  ['ops', 'Ops Readiness', 'scheduled', 1.5, '#4c7f8f'],
];

/** Progress lag per workstream at the as-of date (1 = exactly on plan). Cooling and Network run behind. */
const PROGRESS_FACTOR: Partial<Record<TitanWsKey, number>> = { cooling: 0.82, network: 0.86, site: 0.97, power: 0.95 };

export function buildTitan(): PlanState & { team: ReturnType<typeof titanTeam> } {
  const team = titanTeam(TITAN_PROGRAM_ID);
  const b = new PlanBuilder(TITAN_PROGRAM_ID, 'titan');
  const owners = team.byWs;
  // Round-robin owners within a workstream (lead owns summaries and gates).
  const rr = (key: TitanWsKey) => {
    let i = 0;
    return () => {
      const list = owners[key];
      const p = list[1 + (i++ % (list.length - 1))]!;
      return { owner: p, assignees: i % 3 === 0 ? [p, list[1 + (i % (list.length - 1))]!] : [p] };
    };
  };
  const lead = (key: TitanWsKey) => owners[key][0]!;
  const approvers = ['per_jordan', 'per_alex'];

  // ── Site & Civil ─────────────────────────────────────────────
  b.workstream(WS.site, () => {
    const o = rr('site');
    b.group('pre', 'Permits & approvals', () => {
      b.task('zoning', 'Zoning approval', 15, o());
      b.task('env_review', 'Environmental review', 20, { ...o(), after: ['zoning'] });
      b.task('bldg_permit', 'Building permit', 25, { ...o(), after: ['env_review'] });
      b.task('util_permits', 'Utility permits', 15, { ...o(), after: [['zoning', 'SS', 5]] });
      b.task('fire_review', 'Fire marshal plan review', 10, { ...o(), after: ['bldg_permit'] });
    });
    b.group('design', 'Design', () => {
      b.chain(
        [
          ['concept', 'Concept design', 20],
          ['schematic', 'Schematic design', 25],
          ['dd', 'Design development', 30],
          ['cd', 'Construction documents', 32],
          ['ifc', 'Issued for construction (IFC) package', 4],
        ],
        o(),
      );
      b.gate('g0', 'G0 · Design freeze', {
        after: ['ifc', 'fire_review'],
        owner: lead('site'),
        deadline: '2026-08-15',
        approvers,
        entry: ['IFC package issued', 'Fire marshal review closed', 'Budget re-forecast at ±10%'],
        exit: ['Design frozen; changes via change request', 'Long-lead POs confirmed'],
      });
    });
    b.group('prep', 'Site preparation', () => {
      b.task('mobilize', 'Mobilization', 5, { ...o(), after: ['bldg_permit'] });
      b.task('fencing', 'Site fencing & temporary security', 5, { ...o(), after: ['mobilize'] });
      b.task('grading', 'Clearing & grading', 15, { ...o(), after: ['mobilize'] });
      b.task('underground', 'Underground utilities', 20, { ...o(), after: ['grading'] });
      b.task('stormwater', 'Stormwater management', 10, { ...o(), after: [['grading', 'SS', 5]] });
    });
    b.group('found', 'Foundations', () => {
      b.task('excavation', 'Excavation', 15, { ...o(), after: ['grading', 'g0'] });
      b.task('piles', 'Piling', 20, { ...o(), after: ['excavation'] });
      b.task('footings', 'Footings & grade beams', 15, { ...o(), after: ['piles'] });
      b.task('slab', 'Slab on grade', 16, { ...o(), after: ['footings', 'underground'] });
      b.task('equip_pads', 'Equipment pads (yard)', 10, { ...o(), after: [['slab', 'SS', 4]] });
      b.task('slab_cure', 'Slab cure & flatness testing', 8, { ...o(), after: ['slab'] });
    });
    b.group('struct', 'Structure & envelope', () => {
      b.task('steel', 'Steel erection', 45, { ...o(), after: ['footings'] });
      b.task('roof_deck', 'Roof deck', 15, { ...o(), after: ['steel'] });
      b.task('roofing', 'Roofing', 25, { ...o(), after: ['roof_deck'] });
      b.task('walls', 'Insulated wall panels', 35, { ...o(), after: [['steel', 'SS', 10]] });
      b.task('louvers', 'Doors, louvers & loading dock', 10, { ...o(), after: ['walls'] });
      b.task('dry_in', 'Building dry-in', 4, { ...o(), after: ['roofing', 'walls', 'louvers'] });
    });
    b.gate('g1', 'G1 · Shell complete', {
      after: ['dry_in', 'slab_cure'],
      owner: lead('site'),
      deadline: '2027-01-29',
      approvers,
      entry: ['Building dried in', 'Slab flatness accepted'],
      exit: ['Halls released to MEP trades'],
    });
    HALLS.forEach((h, i) => {
      const k = h.toLowerCase();
      b.group(`hall_${k}`, `Data hall ${h} interiors`, () => {
        b.task(`floor_${k}`, `Hall ${h} · floor prep & sealing`, 6, { ...o(), after: i === 0 ? ['g1'] : ['g1', [`floor_${HALLS[i - 1]!.toLowerCase()}`, 'SS', 6]] });
        b.task(`fire_${k}`, `Hall ${h} · fire suppression`, 10, { ...o(), after: [`floor_${k}`] });
        b.task(`lv_${k}`, `Hall ${h} · lighting & low-voltage`, 8, { ...o(), after: [[`fire_${k}`, 'SS', 3]] });
        b.task(`contain_${k}`, `Hall ${h} · hot-aisle containment frames`, 6, { ...o(), after: [`fire_${k}`] });
      });
    });
  });

  // ── Power ─────────────────────────────────────────────
  b.workstream(WS.power, () => {
    const o = rr('power');
    b.group('util', 'Utility interconnect', () => {
      b.task('ic_app', 'Interconnect application', 15, { ...o(), after: ['zoning'] });
      b.task('ic_study', 'Utility system impact study', 30, { ...o(), after: ['ic_app'] });
      b.task('ic_agreement', 'Interconnect agreement', 12, { ...o(), after: ['ic_study'] });
      b.task('line_ext', 'Utility line extension (by utility)', 70, { ...o(), after: ['ic_agreement'] });
      b.task('metering', 'Revenue metering', 8, { ...o(), after: ['line_ext'] });
    });
    b.group('sub', 'Substation', () => {
      b.task('sub_design', 'Substation design', 20, { ...o(), after: ['g0'] });
      b.procurement('xfmr', 'Main power transformers (2×)', { supplier: 'Northfield Transformer', po: 'PO-2207', valueM: 6, leadDays: 240, ordered: '2026-04-20', expected: '2026-12-16', owner: lead('power') });
      b.task('sub_civil', 'Substation civil & grounding', 18, { ...o(), after: ['equip_pads', 'sub_design'] });
      b.task('xfmr_set', 'Transformer set & dress', 12, { ...o(), after: ['xfmr', 'sub_civil'] });
      b.task('protection', 'Protection & controls', 14, { ...o(), after: ['xfmr_set'] });
      b.task('sub_test', 'Substation testing', 8, { ...o(), after: ['protection'] });
    });
    b.group('mv', 'MV distribution', () => {
      b.procurement('swgr_a', 'MV switchgear lineup A', { supplier: 'VoltGrid Switchgear', po: 'PO-4470', valueM: 4, leadDays: 210, ordered: '2026-05-18', expected: '2026-12-14', owner: lead('power'), guests: ['per_chris'] });
      b.procurement('swgr_b', 'MV switchgear lineup B', { supplier: 'VoltGrid Switchgear', po: 'PO-4471', valueM: 4, leadDays: 230, ordered: '2026-07-15', expected: '2027-03-03', owner: lead('power'), guests: ['per_chris'] });
      b.task('swgr_a_inst', 'Switchgear A install', 10, { ...o(), after: ['swgr_a', 'g1'] });
      b.task('swgr_b_inst', 'Switchgear B install', 10, { ...o(), after: ['swgr_b', 'swgr_a_inst'] });
      b.task('mv_cable', 'MV cabling & terminations', 18, { ...o(), after: ['swgr_a_inst'] });
      b.task('mv_test', 'MV acceptance testing', 8, { ...o(), after: ['mv_cable', 'swgr_b_inst'] });
    });
    b.group('backup', 'Backup power', () => {
      b.procurement('gens', 'Diesel generators (6×)', { supplier: 'Ironclad Power', po: 'PO-3105', valueM: 8, leadDays: 180, ordered: '2026-06-01', expected: '2026-11-28', owner: lead('power') });
      b.procurement('ups', 'UPS modules & batteries', { supplier: 'Helios UPS', po: 'PO-3188', valueM: 7, leadDays: 150, ordered: '2026-08-03', expected: '2026-12-31', owner: lead('power') });
      b.task('gen_pads', 'Generator pads & fuel system', 14, { ...o(), after: ['equip_pads'] });
      b.task('gen_set', 'Generator set & connect', 10, { ...o(), after: ['gens', 'gen_pads'] });
      b.task('gen_loadbank', 'Generator load-bank test', 5, { ...o(), after: ['gen_set', 'mv_test'] });
    });
    b.task('energize', 'Utility energization', 4, { ...o(), after: ['mv_test', 'sub_test', 'metering'] });
    b.gate('g2', 'G2 · Energization', {
      after: ['energize', 'gen_loadbank'],
      owner: lead('power'),
      deadline: '2027-04-08',
      approvers,
      entry: ['MV acceptance tests passed', 'Substation tested', 'Generator load-bank complete'],
      exit: ['Permanent power available to halls', 'Utility energization certificate'],
    });
    HALLS.forEach((h) => {
      const k = h.toLowerCase();
      b.group(`pwr_${k}`, `Hall ${h} power distribution`, () => {
        b.task(`busway_${k}`, `Hall ${h} · busway install`, 8, { ...o(), after: [`lv_${k}`, 'mv_cable'] });
        b.task(`ups_${k}`, `Hall ${h} · UPS & battery install`, 7, { ...o(), after: ['ups', `floor_${k}`] });
        b.task(`pdu_${k}`, `Hall ${h} · PDU set`, 5, { ...o(), after: [`busway_${k}`] });
        b.task(`branch_${k}`, `Hall ${h} · branch circuits`, 6, { ...o(), after: [`pdu_${k}`] });
        b.task(`pwr_qa_${k}`, `Hall ${h} · power QA/QC`, 3, { ...o(), after: [`branch_${k}`, `ups_${k}`] });
      });
    });
  });

  // ── Cooling ─────────────────────────────────────────────
  b.workstream(WS.cooling, () => {
    const o = rr('cooling');
    b.group('plant', 'Central plant', () => {
      b.task('plant_design', 'Plant design & submittals', 18, { ...o(), after: ['g0'] });
      b.procurement('chillers', 'Chillers (4×)', { supplier: 'Northwind Thermal', po: 'PO-5120', valueM: 9, leadDays: 200, ordered: '2026-06-08', expected: '2026-12-26', owner: lead('cooling') });
      b.procurement('towers', 'Cooling towers', { supplier: 'Northwind Thermal', po: 'PO-5121', valueM: 3, leadDays: 150, ordered: '2026-07-06', expected: '2026-12-03', owner: lead('cooling') });
      b.task('chiller_pads', 'Chiller pads & supports', 8, { ...o(), after: ['equip_pads', 'plant_design'] });
      b.task('chiller_set', 'Chiller set & connect', 14, { ...o(), after: ['chillers', 'chiller_pads'] });
      b.task('tower_set', 'Cooling tower set', 10, { ...o(), after: ['towers', 'roofing'] });
      b.task('cw_pipe', 'Condenser water piping', 22, { ...o(), after: [['chiller_set', 'SS', 4], 'tower_set'] });
      b.task('chw_pipe', 'Chilled water piping', 24, { ...o(), after: [['chiller_set', 'SS', 6]] });
      b.task('pumps', 'Pumps & VFDs', 10, { ...o(), after: [['chw_pipe', 'SS', 8]] });
      b.task('bms', 'Building management system (BMS)', 14, { ...o(), after: ['pumps'] });
      b.task('plant_startup', 'Plant start-up', 6, { ...o(), after: ['bms', 'cw_pipe', 'g2'] });
      b.task('tab', 'Testing, adjusting & balancing', 8, { ...o(), after: ['plant_startup'] });
    });
    b.procurement('cdus', 'Coolant distribution units (CDUs)', { supplier: 'FrostLine Systems', po: 'PO-5200', valueM: 6, leadDays: 120, ordered: '2026-09-14', expected: '2027-01-12', owner: lead('cooling') });
    HALLS.forEach((h) => {
      const k = h.toLowerCase();
      b.group(`cool_${k}`, `Hall ${h} liquid cooling`, () => {
        b.task(`cdu_${k}`, `Hall ${h} · CDU install`, 6, { ...o(), after: ['cdus', `floor_${k}`] });
        b.task(`loop_${k}`, `Hall ${h} · secondary loop piping`, 10, { ...o(), after: [`cdu_${k}`, 'chw_pipe'] });
        b.task(`leak_${k}`, `Hall ${h} · leak detection`, 4, { ...o(), after: [`loop_${k}`] });
        b.task(`flush_${k}`, `Hall ${h} · flush & fill`, 5, { ...o(), after: [`leak_${k}`, 'plant_startup'] });
      });
    });
    b.gate('g3', 'G3 · Mechanical completion', {
      after: ['tab', ...HALLS.map((h) => `flush_${h.toLowerCase()}`)],
      owner: lead('cooling'),
      deadline: '2027-06-26',
      approvers,
      entry: ['TAB report accepted', 'All hall loops flushed & filled'],
      exit: ['Cooling available at design load'],
    });
  });

  // ── Network ─────────────────────────────────────────────
  b.workstream(WS.network, () => {
    const o = rr('network');
    b.group('net_core', 'Core network', () => {
      b.task('net_design', 'Fabric & core design', 18, { ...o(), after: ['g0'] });
      b.procurement('switches', 'Fabric switches (spine & leaf)', { supplier: 'Packetforge Networks', po: 'PO-6010', valueM: 6, leadDays: 120, ordered: '2026-09-21', expected: '2027-01-19', owner: lead('network') });
      b.procurement('optics', 'Optics & DAC cables', { supplier: 'Brightwave Optics', po: 'PO-6011', valueM: 4, leadDays: 90, ordered: '2026-11-02', expected: '2027-01-31', owner: lead('network') });
      b.task('carriers', 'Carrier circuits (2× diverse)', 45, { ...o(), after: ['net_design'] });
      b.task('mmr', 'Meet-me room build-out', 12, { ...o(), after: ['g1'] });
      b.task('core_inst', 'Core routers & firewalls install', 6, { ...o(), after: ['switches', 'mmr'] });
      b.task('core_cfg', 'Core configuration & routing', 8, { ...o(), after: ['core_inst', 'carriers'] });
    });
    HALLS.forEach((h) => {
      const k = h.toLowerCase();
      b.group(`net_${k}`, `Hall ${h} fabric`, () => {
        b.task(`tray_${k}`, `Hall ${h} · cable tray`, 6, { ...o(), after: [`lv_${k}`] });
        b.task(`trunks_${k}`, `Hall ${h} · fiber trunks`, 8, { ...o(), after: [`tray_${k}`] });
        b.task(`spine_${k}`, `Hall ${h} · spine install`, 4, { ...o(), after: ['switches', `trunks_${k}`] });
        b.task(`leaf_${k}`, `Hall ${h} · leaf install`, 6, { ...o(), after: [`spine_${k}`] });
        b.task(`optics_${k}`, `Hall ${h} · optics install & link test`, 5, { ...o(), after: ['optics', `leaf_${k}`] });
      });
    });
    b.task('fabric_accept', 'Fabric acceptance test', 6, { ...o(), after: ['core_cfg', ...HALLS.map((h) => `optics_${h.toLowerCase()}`)] });
  });

  // ── Compute procurement ─────────────────────────────────────────────
  b.workstream(WS.compute, () => {
    const o = rr('compute');
    b.group('sourcing', 'Sourcing & contracts', () => {
      b.chain(
        [
          ['rfp', 'Compute RFP', 18],
          ['vendor_sel', 'Vendor selection', 12],
          ['msa', 'Master supply agreement', 15],
          ['financing', 'Financing approval', 8],
        ],
        o(),
      );
    });
    [1, 2, 3, 4].forEach((k, i) => {
      b.group(`batch${k}`, `GPU node batch ${k}`, () => {
        b.procurement(`gpu${k}`, `GPU node batch ${k} (${[512, 512, 512, 512][i]} nodes)`, {
          supplier: 'Apex Compute Systems',
          po: `PO-70${k}0`,
          valueM: 34,
          leadDays: 180,
          ordered: ['2026-10-05', '2026-11-02', '2026-12-07', '2027-01-11'][i]!,
          owner: lead('compute'),
        });
        b.task(`fat${k}`, `Batch ${k} · factory acceptance witness`, 3, { ...o(), after: [[`gpu${k}`, 'FS', -8]] });
        b.task(`recv${k}`, `Batch ${k} · receive & inspect`, 4, { ...o(), after: [`gpu${k}`] });
        b.task(`tag${k}`, `Batch ${k} · asset tagging & CMDB`, 3, { ...o(), after: [`recv${k}`] });
      });
    });
    b.procurement('storage', 'Parallel storage arrays', { supplier: 'Deepwell Storage', po: 'PO-7100', valueM: 8, leadDays: 100, ordered: '2026-10-19', owner: lead('compute') });
    b.task('storage_recv', 'Storage receive & rack', 6, { ...o(), after: ['storage', 'rack_a'] });
    b.procurement('spares', 'Spares pool', { supplier: 'Apex Compute Systems', po: 'PO-7110', valueM: 1.5, leadDays: 60, ordered: '2027-01-11', owner: lead('compute') });
  });

  // ── Rack & Stack ─────────────────────────────────────────────
  b.workstream(WS.rack, () => {
    const o = rr('rack');
    HALLS.forEach((h, i) => {
      const k = h.toLowerCase();
      const batch = i + 1;
      b.group(`rs_${k}`, `Hall ${h} rack & stack`, () => {
        b.task(`rack_${k}`, `Hall ${h} · rack placement & seismic bracing`, 5, { ...o(), after: [`contain_${k}`, `cdu_${k}`] });
        b.task(`whips_${k}`, `Hall ${h} · power whips`, 4, { ...o(), after: [`rack_${k}`, `pdu_${k}`] });
        for (let r = 1; r <= ROWS; r++) {
          const prev = r === 1 ? [`tag${batch}`, `whips_${k}`] : [`install_${k}${r - 1}`];
          b.task(`install_${k}${r}`, `Hall ${h} row ${r} · node install`, 2, { ...o(), after: prev as Dep[] });
          b.task(`cable_${k}${r}`, `Hall ${h} row ${r} · cabling`, 2, { ...o(), after: [`install_${k}${r}`, `leaf_${k}`] });
          b.task(`power_${k}${r}`, `Hall ${h} row ${r} · power-on & firmware`, 1, { ...o(), after: [`cable_${k}${r}`, `l4_${k}`] });
          b.task(`burnin_${k}${r}`, `Hall ${h} row ${r} · burn-in`, 3, { ...o(), after: [`power_${k}${r}`] });
          b.task(`accept_${k}${r}`, `Hall ${h} row ${r} · acceptance`, 1, { ...o(), after: [`burnin_${k}${r}`] });
        }
      });
    });
  });

  // ── Software Stack (agile; sprints arrive in phase 3) ─────────────────────────────────────────────
  b.workstream(WS.software, () => {
    const o = rr('software');
    const stories: [string, number][] = [
      ['Golden OS image pipeline', 8], ['Bare-metal provisioning service', 13], ['Node health checks', 5], ['Firmware update orchestration', 8],
      ['Job scheduler deployment', 13], ['Scheduler accounting & quotas', 8], ['Fair-share policies', 5], ['Parallel file system clients', 8],
      ['Storage tiering policies', 5], ['Object store gateway', 8], ['Metrics pipeline', 8], ['GPU telemetry exporters', 5],
      ['Alert routing to NOC', 3], ['Log aggregation', 5], ['Identity federation (SSO)', 8], ['Project & allocation portal', 13],
      ['User onboarding flow', 5], ['Container runtime for GPU jobs', 8], ['Model checkpoint storage', 5], ['Network fabric automation', 13],
      ['Fabric telemetry dashboards', 5], ['Capacity planning reports', 3], ['Chargeback reports', 5], ['Disaster recovery runbook automation', 8],
      ['Secrets management', 5], ['Vulnerability scanning', 5], ['CIS benchmark hardening', 5], ['Acceptance test harness', 8],
      ['Load-test benchmarks (HPL)', 5], ['Benchmark reporting', 3], ['Pilot users onboarding', 3], ['Documentation site', 3],
    ];
    stories.forEach(([title, points], i) => b.task(`story${i + 1}`, title, 1, { ...o(), points }));
  });

  // ── Commissioning ─────────────────────────────────────────────
  b.workstream(WS.commissioning, () => {
    const o = rr('commissioning');
    b.group('cx_plan', 'Commissioning planning', () => {
      b.task('cx_plan_doc', 'Commissioning plan & scripts', 10, { ...o(), after: ['g0'] });
      b.task('l1_witness', 'L1 factory witness tests', 12, { ...o(), after: [['swgr_a', 'FS', -10], 'cx_plan_doc'] });
      b.task('l2_power', 'L2 installation verification · power', 8, { ...o(), after: ['mv_test'] });
      b.task('l2_cooling', 'L2 installation verification · cooling', 8, { ...o(), after: ['bms'] });
    });
    HALLS.forEach((h) => {
      const k = h.toLowerCase();
      b.group(`cx_${k}`, `Hall ${h} commissioning`, () => {
        b.task(`l3p_${k}`, `Hall ${h} · L3 power functional test`, 4, { ...o(), after: [`pwr_qa_${k}`, 'g2', 'l2_power'] });
        b.task(`l3c_${k}`, `Hall ${h} · L3 cooling functional test`, 4, { ...o(), after: [`flush_${k}`, 'tab', 'l2_cooling'] });
        b.task(`l4_${k}`, `Hall ${h} · L4 integrated load-bank test`, 5, { ...o(), after: [`l3p_${k}`, `l3c_${k}`] });
      });
    });
    b.task('l5', 'L5 integrated systems test (IST)', 20, { ...o(), after: [...HALLS.map((h) => `accept_${h.toLowerCase()}${ROWS}`), 'g3', 'fabric_accept', 'storage_recv', WS.software] });
    b.task('punch', 'Punch list closure', 10, { ...o(), after: [['l5', 'SS', 6]] });
    b.gate('g4', 'G4 · Integrated systems test', {
      after: ['l5', 'punch'],
      owner: lead('commissioning'),
      deadline: '2027-10-30',
      approvers,
      entry: ['All halls L4 passed', 'Fabric acceptance passed', 'Software stack delivered'],
      exit: ['IST report signed', 'Punch list closed'],
    });
    b.task('cust_accept', 'Customer acceptance testing', 15, { ...o(), after: ['g4'] });
  });

  // ── Security & Compliance ─────────────────────────────────────────────
  b.workstream(WS.security, () => {
    const o = rr('security');
    b.task('sec_design', 'Physical security design', 10, { ...o(), after: ['g0'] });
    b.task('access_ctl', 'Access control system', 14, { ...o(), after: ['sec_design', 'dry_in'] });
    b.task('cctv', 'CCTV & monitoring', 10, { ...o(), after: [['access_ctl', 'SS', 4]] });
    b.task('soc', 'Security operations center fit-out', 8, { ...o(), after: ['access_ctl'] });
    HALLS.forEach((h) => {
      const k = h.toLowerCase();
      b.task(`readers_${k}`, `Hall ${h} · access readers & mantraps`, 4, { ...o(), after: ['access_ctl', `contain_${k}`] });
    });
    b.task('soc2_ready', 'SOC 2 readiness assessment', 20, { ...o(), after: ['soc'] });
    b.task('iso_gap', 'ISO 27001 gap assessment', 15, { ...o(), after: [['soc2_ready', 'SS', 5]] });
    b.task('audit', 'Compliance audit fieldwork', 10, { ...o(), after: ['soc2_ready', 'g4'] });
    b.task('compliance_ok', 'Compliance sign-off', 3, { ...o(), after: ['audit'] });
  });

  // ── Ops Readiness ─────────────────────────────────────────────
  b.workstream(WS.ops, () => {
    const o = rr('ops');
    b.task('noc_plan', 'NOC staffing plan', 10, { ...o(), after: ['g0'] });
    b.task('noc_hire', 'Hire & onboard NOC engineers', 45, { ...o(), after: ['noc_plan'] });
    b.task('runbooks', 'Operational runbooks', 30, { ...o(), after: [['noc_hire', 'SS', 10]] });
    b.task('monitoring', 'Monitoring & alerting integration', 12, { ...o(), after: ['runbooks', 'g3'] });
    b.task('depot', 'Spare parts depot', 8, { ...o(), after: ['spares'] });
    b.task('support', 'Vendor support contracts', 15, { ...o(), after: ['msa'] });
    b.task('dr_plan', 'Disaster recovery plan', 15, { ...o(), after: ['runbooks'] });
    b.task('training', 'Operations training', 10, { ...o(), after: ['runbooks', 'monitoring'] });
    b.task('orr', 'Operational readiness review', 3, { ...o(), after: ['training', 'dr_plan', 'depot', 'support'] });
  });

  // Program finish
  b.workstream(WS.commissioning, () => {
    b.gate('g5', 'G5 · Acceptance & go-live', {
      after: ['cust_accept', 'compliance_ok', 'orr'],
      owner: 'per_alex',
      deadline: '2027-12-18',
      approvers,
      entry: ['Customer acceptance passed', 'Compliance sign-off', 'Operational readiness review passed'],
      exit: ['Handover to operations', 'Final account agreed'],
    });
  });

  const program: Program = {
    id: TITAN_PROGRAM_ID,
    name: 'Titan-1',
    code: 'TITAN',
    description: 'HPC data center build — 10 workstreams, ~$250M, stage-gated.',
    start: TITAN_START,
    calendarId: titanCalendar.id,
    currency: 'USD',
    checkinCadence: { weekday: 1, enabled: true },
    budgetCents: WS_META.reduce((s, [, , , m]) => s + m * 100_000_000, 0),
  };
  const workstreams: Workstream[] = WS_META.map(([key, name, mode, budgetM, color], order) => ({
    id: WS[key],
    programId: TITAN_PROGRAM_ID,
    name,
    mode,
    leadId: owners[key][0]!,
    color,
    budgetCents: Math.round(budgetM * 100_000_000),
    order,
  }));

  const plan: PlanState = {
    program,
    calendar: titanCalendar,
    workstreams,
    items: b.items,
    relations: b.relations(),
    sprints: [],
    costEntries: [],
    asOf: TITAN_AS_OF,
  };
  distributeBudget(plan);
  applyProgress(plan);
  return { ...plan, team };
}

/** Workstream budget minus its PO values, spread over its scheduled tasks by duration. */
function distributeBudget(plan: PlanState) {
  for (const ws of plan.workstreams) {
    const items = plan.items.filter((i) => i.workstreamId === ws.id);
    const po = items.reduce((s, i) => s + (i.type === 'procurement' ? i.poValueCents : 0), 0);
    const tasks = items.filter(isTask).filter((t) => t.durationHalfDays > 0);
    const totalDur = tasks.reduce((s, t) => s + t.durationHalfDays, 0);
    let remaining = Math.max(0, ws.budgetCents - po);
    tasks.forEach((t, i) => {
      const share = i === tasks.length - 1 ? remaining : Math.round(((ws.budgetCents - po) * t.durationHalfDays) / totalDur);
      t.budgetCents = Math.max(0, share);
      remaining -= t.budgetCents;
    });
  }
}

/** Sets % complete, status and procurement state as of TITAN_AS_OF, with per-workstream lag. */
function applyProgress(plan: PlanState) {
  const r = schedule(plan);
  const cal = new WorkCalendar(plan.calendar, plan.program.start);
  const t = cal.toSlot(plan.asOf, 'finish');
  const parents = new Set(plan.items.map((i) => i.parentId).filter(Boolean));
  const keyOf = (wsId: string) => (Object.keys(WS) as TitanWsKey[]).find((k) => WS[k] === wsId)!;
  for (const item of plan.items as Item[]) {
    if (parents.has(item.id)) continue;
    const n = r.nodes.get(item.id);
    if (item.type === 'procurement') {
      const delivered = n && n.slots.es <= t;
      item.deliveryStatus = delivered ? 'delivered' : item.orderedOn && item.orderedOn <= plan.asOf ? 'in_production' : 'not_ordered';
      if (delivered) item.delivered = item.expectedDelivery ?? n!.es;
      if (!item.expectedDelivery && n) item.expectedDelivery = n.es;
      item.percentComplete = delivered ? 100 : 0;
      item.status = delivered ? 'done' : item.deliveryStatus === 'in_production' ? 'in_progress' : 'not_started';
      continue;
    }
    if (!n || (item.type !== 'task' && item.type !== 'milestone' && item.type !== 'gate')) continue;
    const factor = PROGRESS_FACTOR[keyOf(item.workstreamId)] ?? 1;
    let planned: number;
    if (n.slots.ef <= t) planned = 1;
    else if (n.slots.es >= t) planned = 0;
    else planned = (t - n.slots.es) / (n.slots.ef - n.slots.es);
    // Lagging workstreams leave recently finished work incomplete too.
    const recent = n.slots.ef > t - 20 && n.slots.ef <= t;
    const pct = planned === 1 && !(recent && factor < 0.9) ? 100 : Math.floor(planned * factor * 100);
    item.percentComplete = Math.min(100, Math.max(0, pct));
    item.status = item.percentComplete >= 100 ? 'done' : item.percentComplete > 0 ? 'in_progress' : 'not_started';
  }
}
