import { Controller, Get, Param, Query } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import type { WalletAnalyticsRange } from './analytics.types';
import type { SuiNetwork } from '../sui/sui.types';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('wallets/:walletAddress/snapshot')
  getSnapshot(
    @Param('walletAddress') walletAddress: string,
    @Query('network') network?: string,
    @Query() query: Record<string, unknown> = {},
  ) {
    return this.analyticsService.getWalletSnapshot(walletAddress, parseNetwork(network), parseRange(query));
  }

  @Get('wallets/:walletAddress/portfolio')
  getPortfolio(
    @Param('walletAddress') walletAddress: string,
    @Query('network') network?: string,
    @Query() query: Record<string, unknown> = {},
  ) {
    return this.analyticsService.getPortfolioSummary(walletAddress, parseNetwork(network), parseRange(query));
  }

  @Get('wallets/:walletAddress/activity')
  getActivity(
    @Param('walletAddress') walletAddress: string,
    @Query('network') network?: string,
    @Query() query: Record<string, unknown> = {},
  ) {
    return this.analyticsService.getActivitySummary(walletAddress, parseNetwork(network), parseRange(query));
  }

  @Get('wallets/:walletAddress/fees')
  getFees(
    @Param('walletAddress') walletAddress: string,
    @Query('network') network?: string,
    @Query() query: Record<string, unknown> = {},
  ) {
    return this.analyticsService.getFeeSummary(walletAddress, parseNetwork(network), parseRange(query));
  }

  @Get('wallets/:walletAddress/protocols')
  getProtocols(
    @Param('walletAddress') walletAddress: string,
    @Query('network') network?: string,
    @Query() query: Record<string, unknown> = {},
  ) {
    return this.analyticsService.getProtocolUsage(walletAddress, parseNetwork(network), parseRange(query));
  }
}

function parseNetwork(value: string | undefined): SuiNetwork | undefined {
  if (value === 'devnet' || value === 'testnet' || value === 'mainnet') {
    return value;
  }

  return undefined;
}

function parseRange(query: Record<string, unknown>): WalletAnalyticsRange {
  const startMs = parseTimeValue(query.from ?? query.startMs ?? query.start);
  const endMs = parseTimeValue(query.to ?? query.endMs ?? query.end);
  return {
    startMs,
    endMs,
  };
}

function parseTimeValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric;
    }

    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }

  return null;
}
