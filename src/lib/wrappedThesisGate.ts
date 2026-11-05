import type { WrappedEvidence, WrappedFact } from './wrappedEvidence';

/**
 * Legacy name retained for callers. This is now ONLY an evidence/shape
 * validator. An independent AI editor evaluates interpretation, humor,
 * novelty, persona and whether the writer merely rephrased logs.
 *
 * An editorial opinion cannot be judged from its punctuation, a list of
 * magic words or a token overlap with another argument.
 */
export function evaluateWrappedThesis(item: any, facts: Map<string, WrappedFact>): {
  acceptable: boolean; reason?: string;
} {
  const thesis = typeof item?.thesis === 'string' ? item.thesis.trim() : '';
  const body = typeof item?.body === 'string' ? item.body.trim() : '';
  if (!thesis || thesis.length > 330) {
    return {acceptable:false,reason:'Missing editorial thesis or exceeds storage limit'};
  }
  if (!body || body.length > 5000) {
    return {acceptable:false,reason:'Missing scene body or exceeds storage limit'};
  }
  const ids: string[] = Array.isArray(item?.evidenceIds) ? item.evidenceIds : [];
  if (!ids.length || ids.length > 5 || ids.some(id => typeof id !== 'string' || !facts.has(id))) {
    return {acceptable:false,reason:'Every interior scene must cite 1–5 actual evidence IDs'};
  }
  return {acceptable:true};
}

export type WrappedThesisGateResult = {
  draft: any;
  cut: Array<{title:string;reason:string}>;
};

/** No editorial filtering or silent deletion; the AI reviewer owns those decisions. */
export function curateWrappedTheses(raw: any, evidence: WrappedEvidence): WrappedThesisGateResult {
  const data = raw?.story && typeof raw.story === 'object' ? raw.story : raw;
  if (!Array.isArray(data?.scenes) || data.scenes.length < 3) {
    throw new Error('Wrapped editorial draft must have opening, argument and closing.');
  }
  const facts = new Map(evidence.facts.map(f => [f.id, f]));
  for (const [index, scene] of data.scenes.entries()) {
    if (index === 0 || index === data.scenes.length - 1) continue;
    const result = evaluateWrappedThesis(scene, facts);
    if (!result.acceptable) {
      throw new Error('Invalid evidence or structure in reviewed scene ' + (index + 1) +
        ' (' + String(scene?.title || 'untitled').slice(0,80) + '): ' + result.reason);
    }
  }
  return {draft:data,cut:[]};
}
