// "Promote to item": a deterministic first guess at what a chat message should become.
// The scripted AI provider uses this; scenario scripts can supply exact drafts.
import type { ItemType, Message } from './types';

export interface PromotionDraft {
  type: Extract<ItemType, 'task' | 'risk' | 'issue' | 'decision' | 'assumption'>;
  title: string;
  workstreamId: string;
  description: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  probability?: 1 | 2 | 3 | 4 | 5;
  impact?: 1 | 2 | 3 | 4 | 5;
  options?: string[];
}

const firstSentence = (s: string) => {
  const t = s.split(/(?<=[.!?])\s/)[0] ?? s;
  return t.length > 80 ? `${t.slice(0, 77).trimEnd()}…` : t.replace(/[.!]$/, '');
};

export function suggestPromotion(msg: Pick<Message, 'body'>, workstreamId: string): PromotionDraft {
  const b = msg.body.toLowerCase();
  const base = { workstreamId, description: msg.body, title: firstSentence(msg.body) };
  if (/(found|discovered|broken|outage|vulnerab|incident|bug|fail(ed|ing)?)/.test(b)) {
    return { ...base, type: 'issue', severity: /critical|sev ?1|outage/.test(b) ? 'critical' : /high|security|auth/.test(b) ? 'high' : 'medium' };
  }
  if (/(could|should we|let'?s|instead|either|or we|decide|after launch|defer|descope)/.test(b)) {
    return { ...base, type: 'decision', options: [] };
  }
  if (/(might|may|worried|concern|risk|could slip|not sure)/.test(b)) {
    return { ...base, type: 'risk', probability: 3, impact: 3 };
  }
  if (/(assume|assuming|assumption)/.test(b)) return { ...base, type: 'assumption' };
  return { ...base, type: 'task' };
}
