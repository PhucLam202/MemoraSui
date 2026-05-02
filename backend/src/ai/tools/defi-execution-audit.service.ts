import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { type ExecutionRejectCode } from './defi-security-guard';

export type ExecutionAuditEvent = 'execution_quote_requested' | 'execution_quote_rejected' | 'execution_quote_built';

@Injectable()
export class DefiExecutionAuditService {
  private readonly logger = new Logger(DefiExecutionAuditService.name);

  log(input: {
    event: ExecutionAuditEvent;
    walletAddress: string;
    intent: 'swap' | 'rebalance' | 'deepbook_order';
    rejectCode?: ExecutionRejectCode;
    reason?: string;
    metadata?: Record<string, unknown>;
  }) {
    const walletHash = createHash('sha256')
      .update(input.walletAddress.toLowerCase())
      .digest('hex')
      .slice(0, 16);
    this.logger.log(
      JSON.stringify({
        event: input.event,
        walletHash,
        intent: input.intent,
        rejectCode: input.rejectCode,
        reason: input.reason,
        metadata: input.metadata,
        timestamp: new Date().toISOString(),
      }),
    );
  }
}
