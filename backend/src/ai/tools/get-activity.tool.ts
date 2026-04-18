import { Injectable } from '@nestjs/common';
import { AnalyticsService } from '../../analytics/analytics.service';
import type { SuiNetwork } from '../../sui/sui.types';

@Injectable()
export class GetActivityTool {
  constructor(private readonly analyticsService: AnalyticsService) {}

  async run(walletAddress: string, network?: SuiNetwork) {
    return this.analyticsService.getActivitySummary(walletAddress, network);
  }
}
