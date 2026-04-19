import { Injectable, NotFoundException } from '@nestjs/common';
import { isValidObjectId } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { buildPaginationResult, normalizeSearch, parseNetwork, type PaginationParams } from '../common/query.utils';
import type { PaginationResult } from '../common/query.utils';
import type { SuiNetwork } from '../sui/sui.types';

type WalletRecord = {
  id: string;
  address: string;
  network: SuiNetwork;
  label?: string;
  userId?: string;
  isPrimary: boolean;
  lastAuthenticatedAt: Date | null;
  lastSyncedAt: Date | null;
  syncCursor: string | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
};

@Injectable()
export class WalletService {
  private readonly fallbackWallets = new Map<string, WalletRecord>();

  constructor(private readonly databaseService: DatabaseService) {}

  async createWallet(input: {
    address: string;
    network?: SuiNetwork;
    label?: string;
    userId?: string;
    isPrimary?: boolean;
  }) {
    const wallet: WalletRecord = {
      id: randomUUID(),
      address: input.address.trim(),
      network: input.network ?? 'testnet',
      label: input.label?.trim() || undefined,
      userId: input.userId?.trim() || undefined,
      isPrimary: input.isPrimary ?? Boolean(input.userId?.trim()),
      lastAuthenticatedAt: null,
      lastSyncedAt: null,
      syncCursor: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const model = this.databaseService.getModel<Record<string, unknown>>('Wallet');
    if (!model) {
      this.fallbackWallets.set(this.walletKey(wallet.address, wallet.network), wallet);
      return wallet;
    }

    if (wallet.userId && wallet.isPrimary) {
      await model.updateMany({ userId: wallet.userId, isPrimary: true }, { $set: { isPrimary: false } });
    }

    const created = await model.findOneAndUpdate(
      {
        address: wallet.address,
        network: wallet.network,
      },
      {
        $set: {
          address: wallet.address,
          label: wallet.label,
          network: wallet.network,
          userId: wallet.userId,
          isPrimary: wallet.isPrimary,
        },
      },
      {
        upsert: true,
        new: true,
      },
    );

    return this.mapWalletDocument(created.toObject<Record<string, unknown>>());
  }

  async getWallet(walletIdOrAddress: string, network?: SuiNetwork) {
    const model = this.databaseService.getModel<Record<string, unknown>>('Wallet');
    if (!model) {
      const fallback = this.findFallbackWallet(walletIdOrAddress, network);
      if (!fallback) {
        throw new NotFoundException('Wallet not found.');
      }

      return fallback;
    }

    const filter: Record<string, unknown> = {
      $or: [{ address: walletIdOrAddress }],
    };
    if (isValidObjectId(walletIdOrAddress)) {
      filter.$or = [{ _id: walletIdOrAddress }, { address: walletIdOrAddress }];
    }
    if (network) {
      filter.network = network;
    }

    const wallet = await model.findOne(filter).lean<Record<string, unknown> | null>();
    if (!wallet) {
      throw new NotFoundException('Wallet not found.');
    }

    return this.mapWalletDocument(wallet);
  }

  async listWallets(input: {
    userId?: string;
    address?: string;
    network?: SuiNetwork;
    search?: string | null;
    pagination: PaginationParams;
  }): Promise<PaginationResult<WalletRecord>> {
    const model = this.databaseService.getModel<Record<string, unknown>>('Wallet');
    if (!model) {
      const items = Array.from(this.fallbackWallets.values()).filter((wallet) => this.matchesWalletFilter(wallet, input));
      const paged = items.slice(input.pagination.skip, input.pagination.skip + input.pagination.limit);
      return buildPaginationResult(paged, items.length, input.pagination);
    }

    const filter: Record<string, unknown> = {};
    if (input.userId) {
      filter.userId = input.userId;
    }
    if (input.address) {
      filter.address = input.address;
    }
    if (input.network) {
      filter.network = input.network;
    }

    const search = normalizeSearch(input.search);
    if (search) {
      filter.$or = [
        { address: { $regex: search, $options: 'i' } },
        { label: { $regex: search, $options: 'i' } },
      ];
    }

    const [items, total] = await Promise.all([
      model
        .find(filter)
        .sort({ updatedAt: -1, createdAt: -1 })
        .skip(input.pagination.skip)
        .limit(input.pagination.limit)
        .lean<Record<string, unknown>[]>(),
      model.countDocuments(filter),
    ]);

    return buildPaginationResult(items.map((item) => this.mapWalletDocument(item)), total, input.pagination);
  }

  async resolveWallet(walletIdOrAddress: string, network?: SuiNetwork) {
    return this.getWallet(walletIdOrAddress, network);
  }

  private matchesWalletFilter(wallet: WalletRecord, input: {
    userId?: string;
    address?: string;
    network?: SuiNetwork;
    search?: string | null;
  }) {
    if (input.userId && wallet.userId !== input.userId) {
      return false;
    }
    if (input.address && wallet.address !== input.address) {
      return false;
    }
    if (input.network && wallet.network !== input.network) {
      return false;
    }

    const search = normalizeSearch(input.search);
    if (!search) {
      return true;
    }

    return [wallet.address, wallet.label ?? ''].some((value) => value.toLowerCase().includes(search.toLowerCase()));
  }

  private findFallbackWallet(walletIdOrAddress: string, network?: SuiNetwork) {
    for (const wallet of this.fallbackWallets.values()) {
      if ((wallet.id === walletIdOrAddress || wallet.address === walletIdOrAddress) && (!network || wallet.network === network)) {
        return wallet;
      }
    }

    return null;
  }

  private walletKey(address: string, network: SuiNetwork) {
    return `${network}:${address.toLowerCase()}`;
  }

  private mapWalletDocument(document: Record<string, unknown>): WalletRecord {
    return {
      id: String(document._id),
      address: String(document.address),
      network: parseNetwork(document.network) ?? 'testnet',
      label: typeof document.label === 'string' ? document.label : undefined,
      userId: typeof document.userId === 'string' ? document.userId : undefined,
      isPrimary: document.isPrimary !== false,
      lastAuthenticatedAt: toDate(document.lastAuthenticatedAt),
      lastSyncedAt: toDate(document.lastSyncedAt),
      syncCursor: typeof document.syncCursor === 'string' ? document.syncCursor : null,
      createdAt: toDate(document.createdAt),
      updatedAt: toDate(document.updatedAt),
    };
  }
}

function toDate(value: unknown) {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}
