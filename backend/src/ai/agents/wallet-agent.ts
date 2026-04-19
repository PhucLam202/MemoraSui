import { Injectable, Logger } from '@nestjs/common';
import { SYSTEM_PROMPT } from '../prompts/system.prompt';
import { MetricsService } from '../../observability/metrics.service';
import { ChatOrchestratorService } from '../orchestrator/chat-orchestrator.service';
import { backendEnv } from '../../config/env';

@Injectable()
export class WalletAgent {
  private readonly logger = new Logger(WalletAgent.name);
  private readonly aiRequests: number[] = [];

  constructor(
    private readonly chatOrchestrator: ChatOrchestratorService,
    private readonly metricsService: MetricsService,
  ) {}

  async answer(input: { walletId: string; question: string }) {
    const startedAt = Date.now();
    if (!this.acquireAiRateLimitSlot()) {
      this.metricsService.recordAiCall(false, 0);
      return {
        intent: 'unknown',
        answer: `${SYSTEM_PROMPT} AI request rate limit reached. Please retry in a moment.`,
        toolCalls: [],
        memoryReads: [],
        memoryWrites: [],
        analyzedFacts: '',
        routeSource: 'classifier',
        plannedToolCalls: [],
      };
    }

    const output = await this.chatOrchestrator.answer(input);
    this.logger.log(`AI harness intent=${output.intent} source=${output.routeSource} tools=${output.toolCalls.map((item) => String(item.tool ?? 'unknown')).join(',')}`);
    this.metricsService.recordAiCall(true, Date.now() - startedAt);
    return output;
  }

  private acquireAiRateLimitSlot() {
    const now = Date.now();
    const windowMs = 60_000;
    const recent = this.aiRequests.filter((timestamp) => now - timestamp <= windowMs);
    if (recent.length >= backendEnv.ai.rateLimitPerMinute) {
      this.aiRequests.length = 0;
      this.aiRequests.push(...recent);
      return false;
    }

    recent.push(now);
    this.aiRequests.length = 0;
    this.aiRequests.push(...recent);
    return true;
  }
}
