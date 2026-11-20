// Titan-1 team: the five demo personas plus ~75 generated, fictional people.
import type { Membership, Person } from '@/domain/types';

const FIRST = ['Maya', 'Omar', 'Lena', 'Diego', 'Aiko', 'Tomás', 'Nadia', 'Kwame', 'Ingrid', 'Rafael', 'Hana', 'Elias', 'Zara', 'Mateo', 'Sofia', 'Arjun', 'Chloe', 'Malik', 'Yuki', 'Bruno', 'Amara', 'Felix', 'Leila', 'Ivan', 'Grace', 'Kenji', 'Noor', 'Lucas', 'Esther', 'Sami', 'Clara', 'Theo', 'Imani', 'Viktor', 'Rosa', 'Daniel', 'Mei', 'Jonas', 'Ayla', 'Hugo'];
const LAST = ['Haddad', 'Lindqvist', 'Moreno', 'Tanaka', 'Mensah', 'Novak', 'Kowalski', 'Adeyemi', 'Brennan', 'Castillo', 'Dubois', 'Eriksen', 'Farouk', 'Gallo', 'Hughes', 'Ibrahim', 'Jensen', 'Kaur', 'Larsen', 'Mbeki', 'Nakamura', 'Okoye', 'Petrov', 'Quinn', 'Rossi', 'Sato', 'Torres', 'Uddin', 'Varga', 'Weber'];
const COLORS = ['#1f5fbf', '#0f7b6c', '#8a4baf', '#b4541a', '#5b6575', '#a3532c', '#3c8c5a', '#b0457b', '#2b8fbf', '#7a6a55'];

export const TITAN_WS = {
  site: 'wst_titan_site',
  power: 'wst_titan_power',
  cooling: 'wst_titan_cooling',
  network: 'wst_titan_network',
  compute: 'wst_titan_compute',
  rack: 'wst_titan_rack',
  software: 'wst_titan_software',
  commissioning: 'wst_titan_commissioning',
  security: 'wst_titan_security',
  ops: 'wst_titan_ops',
} as const;
export type TitanWsKey = keyof typeof TITAN_WS;

/** Contractor firm per workstream (crew leads come from these). */
const CONTRACTORS: Record<TitanWsKey, string> = {
  site: 'Granite Ridge Builders',
  power: 'Summit Electrical',
  cooling: 'Polar Mechanical',
  network: 'Lumen Cabling Co.',
  compute: 'Keel Corp',
  rack: 'Atlas Integration',
  software: 'Keel Corp',
  commissioning: 'Veritas Commissioning',
  security: 'Sentinel Systems',
  ops: 'Keel Corp',
};

const TITLES: Record<TitanWsKey, [lead: string, member: string]> = {
  site: ['Construction Manager', 'Site Engineer'],
  power: ['Power Lead', 'Electrical Engineer'],
  cooling: ['Mechanical Lead', 'Mechanical Engineer'],
  network: ['Network Lead', 'Network Engineer'],
  compute: ['Procurement Lead', 'Buyer'],
  rack: ['Integration Lead', 'Integration Technician'],
  software: ['Platform Lead', 'Platform Engineer'],
  commissioning: ['Commissioning Lead', 'Commissioning Agent'],
  security: ['Security Lead', 'Security Engineer'],
  ops: ['Operations Lead', 'Operations Engineer'],
};

export interface TitanTeam {
  people: Person[];
  memberships: Membership[];
  /** People per workstream, lead first. */
  byWs: Record<TitanWsKey, string[]>;
}

export function titanTeam(programId: string): TitanTeam {
  const people: Person[] = [];
  const memberships: Membership[] = [];
  const byWs = {} as Record<TitanWsKey, string[]>;
  let n = 0;

  const add = (p: Omit<Person, 'avatarColor' | 'home'> & Partial<Person>, role: Membership['role'], ws: string[]) => {
    people.push({ avatarColor: COLORS[people.length % COLORS.length]!, home: (['keel', 'teams', 'slack', 'email'] as const)[people.length % 4]!, ...p });
    memberships.push({ programId, personId: p.id, role, workstreamIds: ws });
  };

  // Personas (ids shared with src/data/seed/index.ts)
  add({ id: 'per_alex', name: 'Alex Rivera', email: 'alex.rivera@keel.example', title: 'Program Manager', org: 'Keel Corp', avatarColor: '#1f5fbf', home: 'keel' }, 'pm', []);
  add({ id: 'per_jordan', name: 'Jordan Lee', email: 'jordan.lee@keel.example', title: 'VP Infrastructure', org: 'Keel Corp', avatarColor: '#b4541a', home: 'email' }, 'exec', []);
  add({ id: 'per_chris', name: 'Chris Wu', email: 'chris.wu@voltgrid.example', title: 'Account Manager', org: 'VoltGrid Switchgear', avatarColor: '#5b6575', home: 'email' }, 'guest', []);

  for (const key of Object.keys(TITAN_WS) as TitanWsKey[]) {
    const ws = TITAN_WS[key];
    const ids: string[] = [];
    const [leadTitle, memberTitle] = TITLES[key];
    if (key === 'power') {
      add({ id: 'per_priya', name: 'Priya Nair', email: 'priya.nair@keel.example', title: leadTitle, org: 'Keel Corp', avatarColor: '#0f7b6c', home: 'teams' }, 'lead', [ws]);
      ids.push('per_priya');
    }
    if (key === 'rack') {
      add({ id: 'per_sam', name: 'Sam Okafor', email: 'sam.okafor@keel.example', title: memberTitle, org: 'Keel Corp', avatarColor: '#8a4baf', home: 'slack' }, 'member', [ws]);
    }
    const count = 8 - ids.length - (key === 'rack' ? 1 : 0);
    for (let i = 0; i < count; i++) {
      const first = FIRST[(n * 7) % FIRST.length]!;
      const last = LAST[(n * 11 + 3) % LAST.length]!;
      n++;
      const contractor = i >= count - 2 && CONTRACTORS[key] !== 'Keel Corp';
      const org = contractor ? CONTRACTORS[key] : 'Keel Corp';
      const domain = contractor ? `${org.toLowerCase().replace(/[^a-z]+/g, '')}.example` : 'keel.example';
      const id = `per_${first.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')}_${last.toLowerCase()}`;
      const isLead = ids.length === 0;
      add(
        {
          id,
          name: `${first} ${last}`,
          email: `${first.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')}.${last.toLowerCase()}@${domain}`,
          title: isLead ? leadTitle : contractor ? 'Crew Lead' : memberTitle,
          org,
        },
        isLead ? 'lead' : 'member',
        [ws],
      );
      ids.push(id);
    }
    if (key === 'rack') ids.splice(1, 0, 'per_sam');
    byWs[key] = ids;
  }
  return { people, memberships, byWs };
}
