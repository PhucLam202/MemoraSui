import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';

export type LangGraphAgentName = 'portfolio' | 'gas' | 'staking' | 'tax' | 'research';

export type LangGraphProviderName = 'openai' | 'deepseek' | 'groq' | 'anthropic';

export type LangGraphProviderConfig = {
  baseUrl: string | null;
  apiKeyEnv: string;
};

export type LangGraphSubagentConfig = {
  enabled: boolean;
  provider: string;
  model: string;
  temperature: number;
  maxTokens?: number;
  systemPrompt: string;
  description: string;
  maxIterations: number;
  tools: string[];
};

export type LangGraphAgentsConfig = {
  version: string;
  providers: Record<string, LangGraphProviderConfig>;
  supervisor: {
    enabled: boolean;
    provider: string;
    model: string;
    temperature: number;
    systemPrompt: string;
  };
  subagents: Record<LangGraphAgentName, LangGraphSubagentConfig>;
  memory: {
    provider: 'memwal' | 'in_memory' | 'disabled';
    enabled: boolean;
    autoSave: boolean;
  };
  general: {
    recursionLimit: number;
    parallelSubagents: boolean;
    responseLength: 'short' | 'medium' | 'long';
  };
};

const DEFAULT_CONFIG: LangGraphAgentsConfig = {
  version: '1.0',
  providers: {
    openai: {
      baseUrl: 'https://api.openai.com/v1',
      apiKeyEnv: 'OPENAI_API_KEY',
    },
    deepseek: {
      baseUrl: 'https://api.deepseek.com/v1',
      apiKeyEnv: 'DEEPSEEK_API_KEY',
    },
    groq: {
      baseUrl: 'https://api.groq.com/openai/v1',
      apiKeyEnv: 'GROQ_API_KEY',
    },
    anthropic: {
      baseUrl: null,
      apiKeyEnv: 'ANTHROPIC_API_KEY',
    },
  },
  supervisor: {
    enabled: true,
    provider: 'openai',
    model: 'openai',
    temperature: 0,
    systemPrompt: [
      'You are the Lead Portfolio AI Assistant for Web3 users.',
      'Build a short execution plan and delegate only to the enabled sub-agents.',
      'Use portfolio for balances, holdings, allocation, PnL, wallet summary, swap planning, and rebalance planning.',
      'Use gas for gas fees, fee trends, execution timing, slippage, price impact, and pre-sign risk checks.',
      'Use staking only for staking positions or rewards.',
      'Use tax only for tax calculations or tax reports.',
      'Return JSON only.',
    ].join('\n'),
  },
  subagents: {
    portfolio: {
      enabled: true,
      provider: 'openai',
      model: 'openai',
      temperature: 0.1,
      maxTokens: 1500,
      systemPrompt: [
        'You are the Portfolio sub-agent.',
        'Your job is to explain holdings, token allocation, portfolio value, PnL, risk, swap planning, and portfolio rebalance plans in a concise factual way.',
        'Use only the provided wallet analytics and tool results.',
        'Prefer formatted balances, amountHuman, usdValue, sharePct, and totalValueUsd.',
        'If a token has no decimals metadata, say so once and keep the response short.',
        'If the portfolio contains only a few holdings, highlight the top holdings first.',
        'If a swap or rebalance is being planned, explain expected outputs and allocation changes before the user signs.',
        'Do not repeat the full tool payload.',
        'Return concise markdown with at most 5 bullets.',
      ].join('\n'),
      description: 'Analyze wallet holdings, allocation, wallet value, portfolio performance, swap planning, and rebalance outcomes',
      maxIterations: 3,
      tools: ['get_wallet_summary', 'get_portfolio'],
    },
    gas: {
      enabled: true,
      provider: 'deepseek',
      model: 'openai',
      temperature: 0.1,
      maxTokens: 1500,
      systemPrompt: [
        'You are the Gas sub-agent.',
        'Your job is to explain gas usage, fee trends, fee outliers, slippage, and transaction risk before signing.',
        'Use only the analytics summary provided by the backend.',
        'Do not output negative fee totals unless they are explicitly raw signed deltas; if so, describe them as tracked fee outflow.',
        'Prefer absolute values for totals and averages.',
        'If there is a notable transaction, include only one digest and its fee.',
        'If a DeFi trade is involved, explain gas estimate, price impact, liquidity concerns, and touched protocols.',
        'Keep the response short and actionable.',
        'Return concise markdown with at most 4 bullets.',
      ].join('\n'),
      description: 'Analyze gas, fee patterns, slippage, and pre-sign transaction risk',
      maxIterations: 3,
      tools: ['get_fee_summary'],
    },
    staking: {
      enabled: false,
      provider: 'openai',
      model: 'openai',
      temperature: 0.1,
      maxTokens: 700,
      systemPrompt: [
        'You are the Staking sub-agent.',
        'Explain staking positions, rewards, APY, and claim timing.',
        'Use only structured backend data.',
        'Be precise about what is known and unknown.',
      ].join('\n'),
      description: 'Track staking positions, rewards, APY, and claim suggestions',
      maxIterations: 2,
      tools: [],
    },
    tax: {
      enabled: false,
      provider: 'deepseek',
      model: 'openai',
      temperature: 0.0,
      maxTokens: 700,
      systemPrompt: [
        'You are the Tax sub-agent.',
        'Focus on capital gains, staking income, and report generation.',
        'Be conservative, explicit, and calculation-oriented.',
        'If data is incomplete, say exactly what is missing.',
      ].join('\n'),
      description: 'Estimate capital gains and staking income for tax support',
      maxIterations: 2,
      tools: [],
    },
    research: {
      enabled: true,
      provider: 'deepseek',
      model: 'deepseek-reasoner',
      temperature: 0.2,
      maxTokens: 3200,
      systemPrompt: [
        'You are the Research sub-agent.',
        'Your job is to gather external information, on-chain data, news, sentiment, and protocol details to help answer user questions.',
        'You can research token information, project background, tokenomics, protocol details, market sentiment, competitor comparison, and on-chain metrics.',
        'Always prioritize recent and verifiable data.',
        'If information is uncertain or outdated, clearly state it.',
        'Combine on-chain data with off-chain context when relevant.',
        'Keep responses factual, well-structured, and cite sources when possible.',
        'Return a detailed markdown report with the sections: Overview, Key Findings, Risks or Caveats, and Sources.',
      ].join('\n'),
      description: 'External research on tokens, protocols, news, sentiment and market context',
      maxIterations: 5,
      tools: ['search_token_info', 'get_protocol_metrics', 'search_web_news', 'get_sentiment_analysis', 'get_onchain_metrics'],
    },
  },
  memory: {
    provider: 'memwal',
    enabled: true,
    autoSave: true,
  },
  general: {
    recursionLimit: 12,
    parallelSubagents: true,
    responseLength: 'long',
  },
};

let cachedConfig: LangGraphAgentsConfig | null = null;

function normalizeSubagentConfig(input: unknown, fallback: LangGraphSubagentConfig): LangGraphSubagentConfig {
  if (!input || typeof input !== 'object') {
    return fallback;
  }
  const record = input as Record<string, unknown>;
  return {
    enabled: typeof record.enabled === 'boolean' ? record.enabled : fallback.enabled,
    provider: typeof record.provider === 'string' && record.provider.trim() ? record.provider.trim() : fallback.provider,
    model: typeof record.model === 'string' && record.model.trim() ? record.model.trim() : fallback.model,
    temperature:
      typeof record.temperature === 'number'
        ? record.temperature
        : typeof record.temp === 'number'
          ? record.temp
          : fallback.temperature,
    maxTokens:
      typeof record.max_tokens === 'number'
        ? record.max_tokens
        : typeof record.maxTokens === 'number'
          ? record.maxTokens
          : fallback.maxTokens,
    systemPrompt:
      typeof record.system_prompt === 'string' && record.system_prompt.trim()
        ? record.system_prompt.trim()
        : typeof record.systemPrompt === 'string' && record.systemPrompt.trim()
          ? record.systemPrompt.trim()
          : fallback.systemPrompt,
    description:
      typeof record.description === 'string' && record.description.trim() ? record.description.trim() : fallback.description,
    maxIterations:
      typeof record.max_iterations === 'number'
        ? record.max_iterations
        : typeof record.maxIterations === 'number'
          ? record.maxIterations
          : fallback.maxIterations,
    tools: Array.isArray(record.tools) ? record.tools.filter((item): item is string => typeof item === 'string') : fallback.tools,
  };
}

function normalizeResponseLength(input: unknown, fallback: 'short' | 'medium' | 'long') {
  return input === 'short' || input === 'medium' || input === 'long' ? input : fallback;
}

function normalizeConfig(input: unknown): LangGraphAgentsConfig {
  if (!input || typeof input !== 'object') {
    return DEFAULT_CONFIG;
  }

  const record = input as Record<string, unknown>;
  const supervisor = record.supervisor && typeof record.supervisor === 'object' ? (record.supervisor as Record<string, unknown>) : {};
  const subagents = record.subagents && typeof record.subagents === 'object' ? (record.subagents as Record<string, unknown>) : {};
  const providers = record.providers && typeof record.providers === 'object' ? (record.providers as Record<string, unknown>) : {};
  const memory = record.memory && typeof record.memory === 'object' ? (record.memory as Record<string, unknown>) : {};
  const general = record.general && typeof record.general === 'object' ? (record.general as Record<string, unknown>) : {};

  return {
    version: typeof record.version === 'string' && record.version.trim() ? record.version.trim() : DEFAULT_CONFIG.version,
    providers: Object.fromEntries(
      Object.entries(DEFAULT_CONFIG.providers).map(([name, fallback]) => {
        const raw = providers[name];
        if (!raw || typeof raw !== 'object') {
          return [name, fallback];
        }
        const value = raw as Record<string, unknown>;
        return [
          name,
          {
            baseUrl:
              typeof value.base_url === 'string'
                ? value.base_url.trim() || null
                : typeof value.baseUrl === 'string'
                  ? value.baseUrl.trim() || null
                  : fallback.baseUrl,
            apiKeyEnv:
              typeof value.api_key_env === 'string' && value.api_key_env.trim()
                ? value.api_key_env.trim()
                : typeof value.apiKeyEnv === 'string' && value.apiKeyEnv.trim()
                  ? value.apiKeyEnv.trim()
                  : fallback.apiKeyEnv,
          },
        ];
      }),
    ),
    supervisor: {
      enabled: typeof supervisor.enabled === 'boolean' ? supervisor.enabled : DEFAULT_CONFIG.supervisor.enabled,
      provider:
        typeof supervisor.provider === 'string' && supervisor.provider.trim()
          ? supervisor.provider.trim()
          : DEFAULT_CONFIG.supervisor.provider,
      model: typeof supervisor.model === 'string' && supervisor.model.trim() ? supervisor.model.trim() : DEFAULT_CONFIG.supervisor.model,
      temperature:
        typeof supervisor.temperature === 'number' ? supervisor.temperature : DEFAULT_CONFIG.supervisor.temperature,
      systemPrompt:
        typeof supervisor.system_prompt === 'string' && supervisor.system_prompt.trim()
          ? supervisor.system_prompt.trim()
          : typeof supervisor.systemPrompt === 'string' && supervisor.systemPrompt.trim()
            ? supervisor.systemPrompt.trim()
            : DEFAULT_CONFIG.supervisor.systemPrompt,
    },
    subagents: {
      portfolio: normalizeSubagentConfig(subagents.portfolio, DEFAULT_CONFIG.subagents.portfolio),
      gas: normalizeSubagentConfig(subagents.gas, DEFAULT_CONFIG.subagents.gas),
      staking: normalizeSubagentConfig(subagents.staking, DEFAULT_CONFIG.subagents.staking),
      tax: normalizeSubagentConfig(subagents.tax, DEFAULT_CONFIG.subagents.tax),
      research: normalizeSubagentConfig(subagents.research, DEFAULT_CONFIG.subagents.research),
    },
    memory: {
      provider:
        memory.provider === 'in_memory' || memory.provider === 'disabled' || memory.provider === 'memwal'
          ? memory.provider
          : DEFAULT_CONFIG.memory.provider,
      enabled: typeof memory.enabled === 'boolean' ? memory.enabled : DEFAULT_CONFIG.memory.enabled,
      autoSave:
        typeof memory.auto_save === 'boolean'
          ? memory.auto_save
          : typeof memory.autoSave === 'boolean'
            ? memory.autoSave
            : DEFAULT_CONFIG.memory.autoSave,
    },
    general: {
      recursionLimit:
        typeof general.recursion_limit === 'number'
          ? general.recursion_limit
          : typeof general.recursionLimit === 'number'
            ? general.recursionLimit
            : DEFAULT_CONFIG.general.recursionLimit,
      parallelSubagents:
        typeof general.parallel_subagents === 'boolean'
          ? general.parallel_subagents
          : typeof general.parallelSubagents === 'boolean'
            ? general.parallelSubagents
            : DEFAULT_CONFIG.general.parallelSubagents,
      responseLength: normalizeResponseLength(
        general.response_length ?? general.responseLength,
        DEFAULT_CONFIG.general.responseLength,
      ),
    },
  };
}

function resolveConfigPath() {
  const cwd = process.cwd();
  const candidates = [
    resolve(cwd, 'src/ai/config/agents.yaml'),
    resolve(cwd, 'backend/src/ai/config/agents.yaml'),
    resolve(cwd, 'dist/ai/config/agents.yaml'),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

export function loadAgentsConfig() {
  if (cachedConfig) {
    return cachedConfig;
  }

  const configPath = resolveConfigPath();
  if (!configPath) {
    cachedConfig = DEFAULT_CONFIG;
    return cachedConfig;
  }

  try {
    const raw = readFileSync(configPath, 'utf8');
    cachedConfig = normalizeConfig(parse(raw));
    return cachedConfig;
  } catch {
    cachedConfig = DEFAULT_CONFIG;
    return cachedConfig;
  }
}

export function getEnabledSubagents(config: LangGraphAgentsConfig) {
  return (Object.entries(config.subagents) as Array<[LangGraphAgentName, LangGraphSubagentConfig]>)
    .filter(([, value]) => value.enabled)
    .map(([name]) => name);
}

export function getSubagentConfig(config: LangGraphAgentsConfig, agent: LangGraphAgentName) {
  return config.subagents[agent];
}

export function getProviderConfig(config: LangGraphAgentsConfig, providerName: string) {
  return config.providers[providerName] ?? null;
}
