import { Logger } from '@nestjs/common';
import { backendEnv } from '../../config/env';
import type { LangGraphAgentsConfig, LangGraphProviderConfig, LangGraphProviderName, LangGraphSubagentConfig } from '../config';

export type LlmMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type LlmClient = {
  complete(messages: LlmMessage[], options?: { maxTokens?: number; temperature?: number; timeoutMs?: number }): Promise<string | null>;
};

const logger = new Logger('LlmFactory');

function resolveApiKey(provider: LangGraphProviderConfig) {
  const fromEnv = process.env[provider.apiKeyEnv];
  return fromEnv?.trim() || backendEnv.openai.apiKey.trim();
}

function resolveBaseUrl(provider: LangGraphProviderConfig) {
  return provider.baseUrl ?? backendEnv.openai.baseUrl;
}

function resolveModelName(providerName: LangGraphProviderName, configuredModel: string) {
  const normalized = configuredModel.trim();
  if (!normalized) {
    return backendEnv.openai.model;
  }

  // "openai" is used in this repo as an internal alias, not as a real provider model id.
  if (normalized === 'openai') {
    return backendEnv.openai.model;
  }

  // Keep explicit DeepSeek model names like "deepseek-reasoner" untouched.
  if (providerName === 'deepseek') {
    return normalized;
  }

  return normalized;
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
  const modelName = resolveModelName(providerName, agentConfig.model);

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
            model: modelName,
            messages,
            temperature: options.temperature ?? agentConfig.temperature ?? 0,
            max_completion_tokens: options.maxTokens ?? (agentConfig as { maxTokens?: number }).maxTokens ?? 1500,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => '');
          logger.warn(
            `LLM request failed for agent "${String(agentName)}" via provider "${providerName}" with status ${response.status}. ${errorText.slice(0, 300)}`,
          );
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
        logger.warn(`LLM response for agent "${String(agentName)}" returned no usable content.`);
        return null;
      } catch (error) {
        logger.warn(
          `LLM request threw for agent "${String(agentName)}" via provider "${providerName}": ${error instanceof Error ? error.message : String(error)}`,
        );
        return null;
      } finally {
        clearTimeout(timeoutId);
      }
    },
  };
}
