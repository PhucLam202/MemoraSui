import { backendEnv } from '../../config/env';
import type { LangGraphAgentsConfig, LangGraphProviderConfig, LangGraphProviderName, LangGraphSubagentConfig } from '../config';

export type LlmMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type LlmClient = {
  complete(messages: LlmMessage[], options?: { maxTokens?: number; temperature?: number; timeoutMs?: number }): Promise<string | null>;
};

function resolveApiKey(provider: LangGraphProviderConfig) {
  const fromEnv = process.env[provider.apiKeyEnv];
  return fromEnv?.trim() || backendEnv.openai.apiKey.trim();
}

function resolveBaseUrl(provider: LangGraphProviderConfig) {
  return provider.baseUrl ?? backendEnv.openai.baseUrl;
}

export function createLLM(
  config: LangGraphAgentsConfig,
  agentName: 'supervisor' | keyof LangGraphAgentsConfig['subagents'],
  isSupervisor = false,
): LlmClient {
  const agentConfig = isSupervisor ? config.supervisor : config.subagents[agentName as keyof LangGraphAgentsConfig['subagents']];
  const providerName = agentConfig.provider as LangGraphProviderName;
  const provider = config.providers[providerName];
  if (!provider) {
    throw new Error(`Provider "${providerName}" not defined in agents.yaml`);
  }
  if (providerName === 'anthropic') {
    throw new Error('Anthropic provider is not wired in this runtime yet.');
  }

  const apiKey = resolveApiKey(provider);
  if (!apiKey) {
    throw new Error(`Missing API key for provider "${providerName}" (${provider.apiKeyEnv})`);
  }

  const baseUrl = resolveBaseUrl(provider).replace(/\/+$/, '');

  return {
    async complete(messages, options = {}) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs ?? backendEnv.openai.timeoutMs);
      try {
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: agentConfig.model,
            messages,
            temperature: options.temperature ?? agentConfig.temperature ?? 0,
            max_completion_tokens: options.maxTokens ?? 700,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          return null;
        }

        const payload = (await response.json()) as {
          choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
        };
        const content = payload.choices?.[0]?.message?.content;
        if (typeof content === 'string') {
          return content.trim();
        }
        if (Array.isArray(content)) {
          return content.map((part) => part.text ?? '').join('').trim() || null;
        }
        return null;
      } catch {
        return null;
      } finally {
        clearTimeout(timeoutId);
      }
    },
  };
}
