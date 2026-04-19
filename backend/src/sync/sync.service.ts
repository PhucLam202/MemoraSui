import { Injectable, InternalServerErrorException, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { backendEnv } from '../config/env';
import { DatabaseService } from '../database/database.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { QueueService } from '../queue/queue.service';
import { SuiIngestionService } from '../sui/sui-ingestion.service';
import type { SuiNetwork } from '../sui/sui.types';
import { MetricsService } from '../observability/metrics.service';
import { maskWalletAddress } from '../common/redaction';
import { WalletService } from '../wallet/wallet.service';

type SyncJobStatus = 'queued' | 'running' | 'completed' | 'failed';

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly queueService: QueueService,
    private readonly suiIngestionService: SuiIngestionService,
    private readonly analyticsService: AnalyticsService,
    private readonly metricsService: MetricsService,
    private readonly walletService: WalletService,
  ) {}

  async createWalletSync(walletId: string, requestedBy?: string): Promise<{
    job: Record<string, unknown> | null;
    queued: boolean;
    status: SyncJobStatus;
    reused?: boolean;
    skipped?: boolean;
  }> {
    const wallet = await this.findWallet(walletId);
    if (!wallet) {
      if (backendEnv.nodeEnv !== 'production' && this.isValidSuiAddress(walletId)) {
        const createdWallet = await this.walletService.createWallet({
          address: walletId,
          network: backendEnv.network,
          label: 'Auto-created sync wallet',
          userId: requestedBy?.trim() || undefined,
          isPrimary: Boolean(requestedBy?.trim()),
        });
        return this.createWalletSync(createdWallet.id, requestedBy);
      }
      throw new NotFoundException('Wallet not found.');
    }

    if (requestedBy && wallet.userId && wallet.userId !== requestedBy) {
      throw new ForbiddenException('You do not own this wallet.');
    }

    if (!this.isValidSuiAddress(wallet.address)) {
      return {
        job: null,
        queued: false,
        status: 'failed',
        skipped: true,
      };
    }

    const existingJob = await this.findActiveJobByWalletId(wallet.id);
    if (existingJob) {
      return {
        job: existingJob,
        queued: existingJob.status === 'queued',
        status: existingJob.status as SyncJobStatus,
        reused: true,
      };
    }

    const job = await this.upsertSyncJob({
      walletId: wallet.id,
      type: 'wallet-sync',
      status: 'queued',
      retryCount: 0,
    });

    await this.scheduleRepeatSyncJob(wallet.id, wallet.address);

    const queue = this.queueService.getQueue();
    if (!queue) {
      return {
        job,
        queued: false,
        status: job.status as SyncJobStatus,
      };
    }

    await queue.add(
      'wallet-sync',
      { jobId: job.id },
      {
        jobId: job.id,
      },
    );

    return {
      job,
      queued: true,
      status: job.status as SyncJobStatus,
    };
  }

  async createWalletSyncByAddress(
    walletAddress: string,
    requestedBy?: string,
    network?: SuiNetwork,
  ): Promise<{
    job: Record<string, unknown> | null;
    queued: boolean;
    status: SyncJobStatus;
    reused?: boolean;
    skipped?: boolean;
  }> {
    const wallet = await this.findWalletByAddress(walletAddress, network);
    if (!wallet) {
      throw new NotFoundException('Wallet not found.');
    }

    return this.createWalletSync(wallet.id, requestedBy);
  }

  async getJobStatus(jobId: string) {
    const job = await this.getSyncJob(jobId);
    if (!job) {
      throw new NotFoundException('Sync job not found.');
    }

    return job;
  }

  async getWalletSyncHistory(
    walletId: string,
    input: {
      page: number;
      limit: number;
      status?: SyncJobStatus;
    },
  ) {
    const wallet = await this.findWallet(walletId);
    if (!wallet) {
      throw new NotFoundException('Wallet not found.');
    }

    const model = this.databaseService.getModel<Record<string, unknown>>('SyncJob');
    if (!model) {
      return {
        items: [],
        pagination: {
          page: input.page,
          limit: input.limit,
          total: 0,
          totalPages: 0,
        },
      };
    }

    const filter: Record<string, unknown> = { walletId: wallet.id };
    if (input.status) {
      filter.status = input.status;
    }

    const skip = (input.page - 1) * input.limit;
    const [items, total] = await Promise.all([
      model
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(input.limit)
        .lean<Record<string, unknown>[]>(),
      model.countDocuments(filter),
    ]);

    return {
      items: items.map((item) => this.mapSyncJob(item)),
      pagination: {
        page: input.page,
        limit: input.limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / input.limit),
      },
    };
  }

  async runSyncJob(jobId: string) {
    const job = await this.getSyncJob(jobId);
    if (!job) {
      throw new NotFoundException('Sync job not found.');
    }

    const wallet = await this.findWallet(String(job.walletId));
    if (!wallet) {
      throw new NotFoundException('Wallet not found.');
    }

    if (job.status === 'completed') {
      return { job, skipped: true };
    }

    const startedAt = new Date();
    await this.patchSyncJob(jobId, {
      startedAt,
      status: 'running',
    });

    try {
      this.logger.verbose(`Running sync job ${jobId} for wallet ${maskWalletAddress(wallet.address)} on ${wallet.network}.`);
      if (!wallet.address || !wallet.network || !this.isValidSuiAddress(wallet.address)) {
        const finishedAt = new Date();
        const failed = await this.patchSyncJob(jobId, {
          finishedAt,
          status: 'failed',
        });
        this.metricsService.recordSyncJob('failed');
        return {
          job: failed,
          skipped: true,
          reason: 'Wallet address is not a valid Sui address.',
        };
      }
      if (!wallet.address || !wallet.network) {
        throw new NotFoundException('Wallet data is incomplete.');
      }
      const snapshot = await this.suiIngestionService.syncWallet(wallet.address, wallet.network, {
        cursor: wallet.syncCursor ?? null,
      });
      this.logDataQualityChecks(wallet, snapshot);
      this.logger.verbose(
        `Sync job ${jobId} fetched ${snapshot.transactions.length} tx, ${snapshot.coins.length} balances, ${snapshot.objects.length} objects on ${wallet.network}.`,
      );

      const finishedAt = new Date();
      const nextCursor = snapshot.nextCursor ?? snapshot.cursor ?? wallet.syncCursor ?? null;
      await this.updateWallet(wallet.id, {
        lastSyncedAt: finishedAt,
        syncCursor: nextCursor,
      });

      try {
        await this.analyticsService.refreshWalletSnapshot(wallet.address, wallet.network);
      } catch (snapshotError) {
        const detail = snapshotError instanceof Error ? snapshotError.message : String(snapshotError);
        this.logger.warn(`Wallet snapshot refresh failed for ${wallet.address}: ${detail}`);
      }

      const completed = await this.patchSyncJob(jobId, {
        finishedAt,
        status: 'completed',
      });

      this.metricsService.recordSyncJob('completed');
      return {
        job: completed,
        snapshot,
      };
    } catch (error) {
      const retryCount = Number(job.retryCount ?? 0) + 1;
      const retryable = this.isRetryable(error);
      const nextStatus: SyncJobStatus = retryable && retryCount <= 3 ? 'queued' : 'failed';

      await this.patchSyncJob(jobId, {
        finishedAt: nextStatus === 'failed' ? new Date() : undefined,
        retryCount,
        status: nextStatus,
      });

      if (retryable && retryCount <= 3) {
        const queue = this.queueService.getQueue();
        if (queue) {
          await queue.add(
            'wallet-sync',
            { jobId },
            {
              delay: this.getBackoffDelayMs(retryCount),
              jobId,
            },
          );
        }
      }

      if (nextStatus === 'failed') {
        this.metricsService.recordSyncJob('failed');
      }
      throw error;
    }
  }

  private async findWallet(walletId: string) {
    const model = this.databaseService.getModel<Record<string, unknown>>('Wallet');
    if (!model) {
      return null;
    }

    const wallet = await model
      .findOne({
        $or: [{ _id: walletId }, { address: walletId }],
      })
      .lean<Record<string, unknown> | null>();
    return wallet ? this.mapWallet(wallet) : null;
  }

  private async findWalletByAddress(walletAddress: string, network?: SuiNetwork) {
    const model = this.databaseService.getModel<Record<string, unknown>>('Wallet');
    if (!model) {
      return null;
    }

    const filter: Record<string, unknown> = { address: walletAddress };
    if (network) {
      filter.network = network;
    }

    const wallet = await model.findOne(filter).lean<Record<string, unknown> | null>();
    return wallet ? this.mapWallet(wallet) : null;
  }

  private isValidSuiAddress(value: string) {
    return /^0x[0-9a-f]+$/i.test(value.trim());
  }

  private async getSyncJob(jobId: string) {
    const model = this.databaseService.getModel<Record<string, unknown>>('SyncJob');
    if (!model) {
      return null;
    }

    const job = await model.findOne({ _id: jobId }).lean<Record<string, unknown> | null>();
    return job ? this.mapSyncJob(job) : null;
  }

  private async findActiveJobByWalletId(walletId: string) {
    const model = this.databaseService.getModel<Record<string, unknown>>('SyncJob');
    if (!model) {
      return null;
    }

    const job = await model
      .findOne({ walletId, status: { $in: ['queued', 'running'] } })
      .sort({ createdAt: -1 })
      .lean<Record<string, unknown> | null>();
    return job ? this.mapSyncJob(job) : null;
  }

  private async upsertSyncJob(input: {
    walletId: string;
    type: string;
    status: SyncJobStatus;
    retryCount: number;
  }) {
    const model = this.databaseService.getModel<Record<string, unknown>>('SyncJob');
    if (!model) {
      throw new InternalServerErrorException('MongoDB is not available.');
    }

    const created = await model.create({
      _id: randomUUID(),
      ...input,
    });

    return this.mapSyncJob(created.toObject<Record<string, unknown>>());
  }

  private async patchSyncJob(jobId: string, patch: Record<string, unknown>) {
    const model = this.databaseService.getModel<Record<string, unknown>>('SyncJob');
    if (!model) {
      throw new InternalServerErrorException('MongoDB is not available.');
    }

    const updated = await model.findByIdAndUpdate(jobId, { $set: patch }, { new: true });
    if (!updated) {
      throw new NotFoundException('Sync job not found.');
    }

    return this.mapSyncJob(updated.toObject<Record<string, unknown>>());
  }

  private async scheduleRepeatSyncJob(walletId: string, walletAddress: string) {
    const queue = this.queueService.getQueue();
    if (!queue) {
      return;
    }

    await queue.add(
      'wallet-sync-repeat',
      { walletId, walletAddress },
      {
        jobId: `wallet-sync-repeat:${walletId}`,
        repeat: {
          every: 60_000,
        },
        removeOnComplete: true,
        removeOnFail: 10,
      },
    );
  }

  private async updateWallet(walletId: string, patch: Record<string, unknown>) {
    const model = this.databaseService.getModel<Record<string, unknown>>('Wallet');
    if (!model) {
      throw new InternalServerErrorException('MongoDB is not available.');
    }

    await model.findByIdAndUpdate(walletId, { $set: patch }, { new: true });
  }

  private mapWallet(document: Record<string, unknown>) {
    return {
      address: String(document.address),
      id: String(document._id),
      network: String(document.network) as SuiNetwork,
      syncCursor: typeof document.syncCursor === 'string' ? document.syncCursor : null,
      userId: typeof document.userId === 'string' ? document.userId : null,
    };
  }

  private mapSyncJob(document: Record<string, unknown>) {
    return {
      finishedAt: document.finishedAt ?? null,
      id: String(document._id),
      retryCount: Number(document.retryCount ?? 0),
      startedAt: document.startedAt ?? null,
      status: String(document.status),
      type: String(document.type),
      walletId: String(document.walletId),
    };
  }

  private isRetryable(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return /timeout|ETIMEDOUT|ECONNRESET|429|rate limit|503|502/i.test(message);
  }

  private getBackoffDelayMs(retryCount: number) {
    return Math.min(1000 * 2 ** Math.max(0, retryCount - 1), 30_000);
  }

  private logDataQualityChecks(
    wallet: { address: string; network: SuiNetwork; syncCursor: string | null },
    snapshot: {
      cursor: string | null;
      nextCursor: string | null;
      transactions: Array<{ digest: string; status: string }>;
      coins: Array<{ coinType: string; balance: string }>;
      objects: Array<{ objectId: string }>;
    },
  ) {
    const seenDigests = new Set<string>();
    const duplicateDigests: string[] = [];
    for (const tx of snapshot.transactions) {
      if (seenDigests.has(tx.digest)) {
        duplicateDigests.push(tx.digest);
      } else {
        seenDigests.add(tx.digest);
      }
    }

    if (duplicateDigests.length > 0) {
      this.logger.warn(
        `Duplicate tx detected for wallet ${maskWalletAddress(wallet.address)}: count=${duplicateDigests.length}`,
      );
    }

    if (wallet.syncCursor && !snapshot.nextCursor && snapshot.transactions.length > 0) {
      this.logger.warn(
        `Missing next cursor for wallet ${maskWalletAddress(wallet.address)} with non-empty snapshot.`,
      );
    }

    const totalFailed = snapshot.transactions.filter((tx) => String(tx.status).toLowerCase() === 'failure').length;
    if (snapshot.coins.length > 0 && snapshot.transactions.length > 0 && totalFailed === snapshot.transactions.length) {
      this.logger.warn(
        `Potential balance/transaction mismatch for wallet ${maskWalletAddress(wallet.address)}: all tx failed but balances updated.`,
      );
    }
  }
}
