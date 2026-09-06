/**
 * The retrieval backends a Codex may be researched with.
 *
 * EVERY ENTRY HERE IS A DEEP SEARCH. NanoGPT offers standard, fast, neural and
 * instant modes for most of these providers and none of them belong in this
 * list: a Codex is compiled once and read for the life of the entry by every
 * other feature in the app, and the difference between a deep pass and a shallow
 * one is the difference between thirty-six sources and none. The dropdown exists
 * to compare crawlers, not to trade depth for money.
 *
 * They genuinely differ in what they surface. Linkup and Tavily are general web
 * crawlers; Exa is built around neural retrieval and reaches forum and community
 * pages the others miss, which is exactly where the memories live; Perplexity
 * arrives pre-summarised; Kagi's search tier is the expensive thorough one.
 * Which is best for this is an empirical question, which is why it is a setting.
 *
 * `suffix` is appended to the model name and `depth`/`provider` go in the request
 * body. Both are sent — see `resolveModel`, where a run that billed a deep fee
 * and a run that silently billed a standard one came from the same code.
 */
export interface SearchProviderOption {
  id: string;
  label: string;
  /** Appended to the model name, e.g. `glm-5.3-flash:online/tavily-deep`. */
  suffix: string;
  /** The `webSearch.provider` value for the request body. */
  provider: string;
  /** The `webSearch.depth` value. Exa names its deepest modes differently. */
  depth: string;
  /** Roughly what one search costs, for the person choosing. */
  price: string;
  note: string;
}

export const SEARCH_PROVIDERS: SearchProviderOption[] = [
  {
    id: "linkup-deep",
    label: "Linkup — deep",
    suffix: "linkup-deep",
    provider: "linkup",
    depth: "deep",
    price: "$0.06",
    note: "NanoGPT's default backend, and what every Codex so far was built with.",
  },
  {
    id: "tavily-deep",
    label: "Tavily — deep",
    suffix: "tavily-deep",
    provider: "tavily",
    depth: "deep",
    price: "$0.016",
    note: "A general crawler at about a quarter of Linkup's price.",
  },
  {
    id: "exa-deep",
    label: "Exa — deep",
    suffix: "exa-deep",
    provider: "exa",
    depth: "deep",
    price: "$0.005 + $0.001/page",
    note: "Neural retrieval. Reaches forums and community pages the general crawlers miss. Forces a live fetch (livecrawl) rather than relying on Exa's index, so a same-day release has a chance of being found.",
  },
  {
    id: "exa-deep-reasoning",
    label: "Exa — deep reasoning",
    suffix: "exa-deep-reasoning",
    provider: "exa",
    depth: "deep-reasoning",
    price: "$0.005 + $0.001/page",
    note: "Exa's deepest mode: it reasons about what to look for next between queries. Same live-fetch behavior as Exa deep.",
  },
  {
    id: "perplexity-deep",
    label: "Perplexity — deep",
    suffix: "perplexity-deep",
    provider: "perplexity",
    depth: "deep",
    price: "$0.005",
    note: "Arrives already summarised, which can help or can flatten the detail.",
  },
  {
    id: "brave-deep",
    label: "Brave — deep",
    suffix: "brave-deep",
    provider: "brave",
    depth: "deep",
    price: "$0.005",
    note: "Brave's own index rather than a re-crawl of somebody else's.",
  },
  {
    id: "valyu-deep",
    label: "Valyu — deep",
    suffix: "valyu-deep",
    provider: "valyu",
    depth: "deep",
    price: "~$0.0015/result",
    note: "Priced per result, so the cost moves with how much it finds.",
  },
  {
    id: "kagi-search",
    label: "Kagi — deep search",
    suffix: "kagi-search",
    provider: "kagi",
    depth: "deep",
    price: "$0.025",
    note: "Kagi's full search tier. The only one of its modes that is deep.",
  },
];

/** What a Codex uses when nothing has been chosen. */
export const DEFAULT_SEARCH_PROVIDER = "linkup-deep";

export function searchProviderById(id?: string | null): SearchProviderOption {
  const found = SEARCH_PROVIDERS.find((p) => p.id === (id || "").trim());
  return found || SEARCH_PROVIDERS[0];
}

/**
 * The reverse lookup: given the provider+depth a request actually sent, which
 * of these options was that.
 *
 * Used wherever a caller has the raw `{ provider, depth }` pair a call was
 * made with — the model-suffix resolver — and needs to get back to the option
 * that describes it, to read its label.
 */
export function searchProviderByProviderAndDepth(provider: string, depth: string): SearchProviderOption | undefined {
  return SEARCH_PROVIDERS.find((p) => p.provider === provider && p.depth === depth);
}
