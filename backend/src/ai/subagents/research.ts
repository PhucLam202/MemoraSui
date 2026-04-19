import { type LangGraphAgentState } from '../graph/state';
import { createLLM } from '../llm/llmFactory';
import { loadAgentsConfig } from '../config';
import { type AiStreamEmitter } from '../orchestrator/ai-harness.types';

type ResearchSource = {
  title: string;
  url: string;
  snippet: string;
  source: 'tavily' | 'duckduckgo';
  publishedAt?: string;
};

type ResearchRunOptions = {
  emit?: AiStreamEmitter;
};

const MAX_SOURCES = 5;
const TAVILY_ENDPOINT = 'https://api.tavily.com/search';
const DUCKDUCKGO_ENDPOINT = 'https://html.duckduckgo.com/html/';

const BLOCKCHAIN_KEYWORDS = /(sui|blockchain|token|protocol|defi|web3|crypto|coin|nft|on-chain|onchain|wallet|dex|bridge|validator|mainnet|testnet|walrus)/i;
const WALRUS_AMBIGUITY_KEYWORDS = /(walrus)/i;
const ANIMAL_NOISE_KEYWORDS = /(britannica|wikipedia|animal|marine mammal|mammal|walrus \(animal\)|moóc|hải mã|odobenus)/i;

function buildResearchPrompt(question: string, recalledMemories: string[], sources: ResearchSource[]) {
  const sourceLines = sources.length > 0
    ? sources.map((source, index) => {
        const datePart = source.publishedAt ? ` | published: ${source.publishedAt}` : '';
        return `${index + 1}. [${source.source}] ${source.title}${datePart}\n   ${source.url}\n   ${source.snippet}`;
      }).join('\n')
    : 'No external sources were found.';

  return [
    'You are the Research sub-agent.',
    'Use the provided search results as the only source of truth.',
    'You gather recent, verifiable context about a token, protocol, project, or ecosystem.',
    'Return concise markdown with sections: Summary, Key Facts, Risks, Sentiment.',
    'If evidence is weak or incomplete, say that clearly and explain what is missing.',
    'Do not invent sources.',
    'Do not say there is no information if search results are available; instead summarize what was found.',
    '',
    `Question: ${question}`,
    recalledMemories.length > 0 ? `Recall: ${recalledMemories.join(' | ')}` : 'Recall: none',
    '',
    'Search results:',
    sourceLines,
  ].join('\n');
}

function buildResearchSearchQuery(question: string) {
  const trimmed = question.trim();
  const base = trimmed.length > 0 ? trimmed : 'Walrus';

  if (WALRUS_AMBIGUITY_KEYWORDS.test(base) && !BLOCKCHAIN_KEYWORDS.test(base)) {
    return `${base} Sui blockchain token protocol`;
  }

  if (BLOCKCHAIN_KEYWORDS.test(base)) {
    return `${base} blockchain token protocol`;
  }

  return `${base} Sui blockchain token protocol`;
}

function cleanText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function truncateText(value: string, maxLength: number) {
  const normalized = cleanText(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(maxLength - 1, 0)).trimEnd()}…`;
}

function normalizeUrl(value: string) {
  try {
    const url = new URL(value);
    return url.toString();
  } catch {
    return value;
  }
}

function isAnimalNoise(source: ResearchSource) {
  return ANIMAL_NOISE_KEYWORDS.test(source.title) || ANIMAL_NOISE_KEYWORDS.test(source.snippet) || ANIMAL_NOISE_KEYWORDS.test(source.url);
}

function scoreResearchSource(source: ResearchSource) {
  const text = `${source.title} ${source.snippet}`.toLowerCase();
  let score = 0;
  if (/(sui|blockchain|token|protocol|defi|web3|crypto|wallet|on-chain|onchain|mainnet|testnet|bridge|dex)/i.test(text)) {
    score += 3;
  }
  if (/(walrus)/i.test(text)) {
    score += 2;
  }
  if (/(official|docs|docs\.|github|mysten|walrus foundation|blog)/i.test(text)) {
    score += 1;
  }
  if (isAnimalNoise(source)) {
    score -= 10;
  }
  return score;
}

function decodeDuckDuckGoUrl(rawUrl: string) {
  const trimmed = rawUrl.trim();
  if (!trimmed) return trimmed;

  try {
    const url = new URL(trimmed.startsWith('//') ? `https:${trimmed}` : trimmed);
    const encoded = url.searchParams.get('uddg');
    if (encoded) {
      return normalizeUrl(decodeURIComponent(encoded));
    }
    return url.toString();
  } catch {
    return trimmed;
  }
}

async function searchTavily(query: string): Promise<ResearchSource[]> {
  const apiKey = process.env.TAVILY_API_KEY?.trim();
  if (!apiKey) {
    return [];
  }

  const response = await fetch(TAVILY_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      topic: 'general',
      search_depth: 'advanced',
      max_results: MAX_SOURCES,
      include_answer: false,
      include_raw_content: false,
      include_favicon: false,
      include_images: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Tavily search failed with status ${response.status}`);
  }

  const data = (await response.json()) as {
    results?: Array<{
      title?: string;
      url?: string;
      content?: string;
      published_date?: string;
    }>;
  };

  return (data.results ?? [])
    .filter((item): item is { title: string; url: string; content?: string; published_date?: string } =>
      typeof item.title === 'string' &&
      item.title.trim().length > 0 &&
      typeof item.url === 'string' &&
      item.url.trim().length > 0,
    )
    .map((item) => ({
      title: cleanText(item.title),
      url: normalizeUrl(item.url),
      snippet: truncateText(item.content ?? 'No snippet provided by Tavily.', 320),
      source: 'tavily' as const,
      publishedAt: typeof item.published_date === 'string' ? item.published_date : undefined,
    }))
    .filter((item) => !isAnimalNoise(item))
    .sort((a, b) => scoreResearchSource(b) - scoreResearchSource(a))
    .slice(0, MAX_SOURCES);
}

async function searchDuckDuckGo(query: string): Promise<ResearchSource[]> {
  const response = await fetch(`${DUCKDUCKGO_ENDPOINT}?q=${encodeURIComponent(query)}&kl=us-en`, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });

  if (!response.ok) {
    throw new Error(`DuckDuckGo search failed with status ${response.status}`);
  }

  const html = await response.text();
  const results: ResearchSource[] = [];
  const blockRegex = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>|<div[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/div>)/gi;

  for (const match of html.matchAll(blockRegex)) {
    const rawUrl = match[1];
    const titleHtml = match[2] ?? '';
    const snippetHtml = match[3] ?? match[4] ?? '';
    const title = cleanText(titleHtml.replace(/<[^>]+>/g, ' '));
    const snippet = truncateText(snippetHtml.replace(/<[^>]+>/g, ' '), 320);
    if (!title || !rawUrl) continue;

    results.push({
      title,
      url: decodeDuckDuckGoUrl(rawUrl),
      snippet,
      source: 'duckduckgo',
    });

    if (results.length >= MAX_SOURCES) {
      break;
    }
  }

  return results
    .filter((item) => !isAnimalNoise(item))
    .sort((a, b) => scoreResearchSource(b) - scoreResearchSource(a))
    .slice(0, MAX_SOURCES);
}

async function gatherResearchSources(question: string): Promise<ResearchSource[]> {
  const query = buildResearchSearchQuery(question);
  try {
    const tavilyResults = await searchTavily(query);
    if (tavilyResults.length > 0) {
      return tavilyResults;
    }
  } catch {
    // Fall back to DuckDuckGo below.
  }

  try {
    return await searchDuckDuckGo(query);
  } catch {
    return [];
  }
}

function buildFallbackResearchAnswer(question: string, sources: ResearchSource[]) {
  const sourceSummary =
    sources.length > 0
      ? sources
          .map((source) => `- ${source.title} (${source.url})`)
          .join('\n')
      : '- No external sources were returned by Tavily or DuckDuckGo.';

  return [
    'Summary',
    `- I found ${sources.length > 0 ? `${sources.length} external source(s)` : 'no external sources'} for "${question}".`,
    '',
    'Key Facts',
    sourceSummary,
    '',
    'Risks',
    '- Search quality depends on source coverage and the current web index.',
    '',
    'Sentiment',
    '- No sentiment signal was extracted because the question needs source-level review.',
  ].join('\n');
}

export async function runResearchSubagent(state: LangGraphAgentState, options: ResearchRunOptions = {}) {
  const config = loadAgentsConfig();
  const llm = createLLM(config, 'research');
  const emit = options.emit;
  const searchQuery = buildResearchSearchQuery(state.question);

  emit?.({
    type: 'step_start',
    id: 'research.search',
    label: 'Search on the web',
    detail: searchQuery,
    timestamp: Date.now(),
  });

  const sources = await gatherResearchSources(state.question);

  emit?.({
    type: 'step_end',
    id: 'research.search',
    label: 'Search on the web',
    detail: `${sources.length} source${sources.length === 1 ? '' : 's'} collected.`,
    status: 'completed',
    timestamp: Date.now(),
  });

  emit?.({
    type: 'step_start',
    id: 'research.view',
    label: 'View web page',
    detail: sources[0]?.title ?? 'Reviewing search results.',
    timestamp: Date.now(),
  });

  const questionIsBlockchainRelated = BLOCKCHAIN_KEYWORDS.test(state.question) || WALRUS_AMBIGUITY_KEYWORDS.test(state.question);

  if (sources.length > 0) {
    const firstSource = sources[0];
    if (!firstSource) {
      return {
        subResults: {
          research: {
            text: buildFallbackResearchAnswer(questionIsBlockchainRelated ? `${state.question} (Sui/blockchain context)` : state.question, sources),
            sources,
          },
        },
      };
    }
    emit?.({
      type: 'step_update',
      id: 'research.view',
      label: 'View web page',
      detail: `Reading ${firstSource.title}.`,
      timestamp: Date.now(),
    });
  }

  emit?.({
    type: 'step_end',
    id: 'research.view',
    label: 'View web page',
    detail: 'Source review completed.',
    status: 'completed',
    timestamp: Date.now(),
  });

  emit?.({
    type: 'step_start',
    id: 'research.summarize',
    label: 'Summarize findings',
    detail: 'Generating the final research answer.',
    timestamp: Date.now(),
  });

  const response = await llm.complete(
    [
      {
        role: 'system',
        content:
          config.subagents.research.systemPrompt ||
          [
            'You are the Research sub-agent.',
            'Focus on blockchain, token, protocol, and ecosystem research.',
            'Prefer Sui ecosystem context when the query is ambiguous.',
            'Return concise markdown with Summary, Key Facts, Risks, Sentiment.',
            'Do not use animal or encyclopedia results when the user is asking about crypto or blockchain.',
          ].join('\n'),
      },
      {
        role: 'user',
        content: buildResearchPrompt(state.question, state.recalledMemories, sources),
      },
    ],
    {
      temperature: config.subagents.research.temperature,
      maxTokens: 500,
    },
  );

  emit?.({
    type: 'step_end',
    id: 'research.summarize',
    label: 'Summarize findings',
    detail: 'Research summary completed.',
    status: 'completed',
    timestamp: Date.now(),
  });

  return {
    subResults: {
      research: {
        text: response?.trim() || buildFallbackResearchAnswer(questionIsBlockchainRelated ? `${state.question} (Sui/blockchain context)` : state.question, sources),
        sources,
      },
    },
  };
}
