import { Body, Controller, Get, Headers, Param, Post, Query } from '@nestjs/common';
import { parsePagination } from '../common/query.utils';
import { SyncService } from './sync.service';
import type { SuiNetwork } from '../sui/sui.types';

@Controller('sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post('wallets/:walletId')
  triggerWalletSync(
    @Param('walletId') walletId: string,
    @Headers('x-user-id') requestedBy?: string,
  ) {
    return this.syncService.createWalletSync(walletId, requestedBy);
  }

  @Post('wallet-addresses/:walletAddress')
  triggerWalletSyncByAddress(
    @Param('walletAddress') walletAddress: string,
    @Query('network') network?: string,
    @Query('force') force?: string,
    @Headers('x-user-id') requestedBy?: string,
  ) {
    return this.syncService.createWalletSyncByAddress(walletAddress, requestedBy, parseNetwork(network), parseBoolean(force));
  }

  @Post('jobs/:jobId/run')
  runSyncJob(@Param('jobId') jobId: string, @Body() _body: unknown) {
    return this.syncService.runSyncJob(jobId);
  }

  @Get('jobs/:jobId')
  getSyncJob(@Param('jobId') jobId: string) {
    return this.syncService.getJobStatus(jobId);
  }

  @Get('wallets/:walletId/history')
  getWalletSyncHistory(@Param('walletId') walletId: string, @Query() query: Record<string, unknown> = {}) {
    const pagination = parsePagination(query);
    const status = query.status;

    return this.syncService.getWalletSyncHistory(walletId, {
      page: pagination.page,
      limit: pagination.limit,
      status: status === 'queued' || status === 'running' || status === 'completed' || status === 'failed' ? status : undefined,
    });
  }
}

function parseNetwork(value: string | undefined): SuiNetwork | undefined {
  if (value === 'devnet' || value === 'testnet' || value === 'mainnet') {
    return value;
  }

  return undefined;
}

function parseBoolean(value: string | undefined) {
  if (!value) {
    return false;
  }

  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}
