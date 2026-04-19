import { Injectable, Logger } from '@nestjs/common';

import { backendEnv } from '../../config/env';

export type OpenAiMessageRole = 'system' | 'user' | 'assistant';

export type OpenAiMessage = {
  role: OpenAiMessageRole;
  content: string;
};

export type OpenAiChatOptions = {
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
};

@Injectable()
export class OpenAiClient {
  private readonly logger = new Logger(OpenAiClient.name);

  isEnabled() {
    return backendEnv.openai.enabled && backendEnv.openai.apiKey.trim().length > 0;
  }

  async complete(messages: OpenAiMessage[], options: OpenAiChatOptions = {}) {
    if (!this.isEnabled()) {
      return null;
    }

    const controller = new AbortController();
    const timeoutMs = options.timeoutMs ?? backendEnv.openai.timeoutMs;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${backendEnv.openai.baseUrl.replace(/\/+$/, '')}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${backendEnv.openai.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: backendEnv.openai.model,
          messages,
          max_completion_tokens: options.maxTokens ?? 700,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        this.logger.warn(
          `OpenAI request failed with status ${response.status}${errorBody ? ` body=${errorBody.slice(0, 1000)}` : ''}`,
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
      return null;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.warn(`OpenAI request failed: ${detail}`);
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
