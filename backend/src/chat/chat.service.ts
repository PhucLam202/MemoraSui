import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { buildPaginationResult, type PaginationParams, type PaginationResult } from '../common/query.utils';
import { DatabaseService } from '../database/database.service';
import { WalletAgent } from '../ai/agents/wallet-agent';
import { buildSessionTitle } from '../ai/parsers/structured-output.parser';
import { WalletService } from '../wallet/wallet.service';

type ChatSessionRecord = {
  id: string;
  walletId: string;
  title: string;
  createdAt: Date;
  lastMessageAt: Date;
};

type ChatMessageRecord = {
  id: string;
  sessionId: string;
  walletId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls: Array<Record<string, unknown>>;
  memoryReferences: Array<Record<string, unknown>>;
  timestamp: Date;
};

@Injectable()
export class ChatService {
  private readonly fallbackSessions = new Map<string, ChatSessionRecord>();
  private readonly fallbackMessages = new Map<string, ChatMessageRecord[]>();

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly walletService: WalletService,
    private readonly walletAgent: WalletAgent,
  ) {}

  async createSession(input: { walletId: string; title?: string }) {
    await this.walletService.resolveWallet(input.walletId);

    const now = new Date();
    const session: ChatSessionRecord = {
      id: randomUUID(),
      walletId: input.walletId,
      title: input.title?.trim() || 'Wallet chat',
      createdAt: now,
      lastMessageAt: now,
    };

    const model = this.databaseService.getModel<Record<string, unknown>>('ChatSession');
    if (!model) {
      this.fallbackSessions.set(session.id, session);
      return session;
    }

    const created = await model.create({
      walletId: session.walletId,
      title: session.title,
      lastMessageAt: session.lastMessageAt,
    });

    return this.mapSessionDocument(created.toObject<Record<string, unknown>>());
  }

  async sendMessage(input: { sessionId?: string; walletId: string; content: string }) {
    const session = input.sessionId
      ? await this.getSession(input.sessionId)
      : await this.createSession({
          walletId: input.walletId,
          title: buildSessionTitle(input.content),
        });

    const userMessage = await this.persistMessage({
      id: randomUUID(),
      sessionId: session.id,
      walletId: session.walletId,
      role: 'user',
      content: input.content,
      toolCalls: [],
      memoryReferences: [],
      timestamp: new Date(),
    });

    const answer = await this.walletAgent.answer({
      walletId: session.walletId,
      question: input.content,
    });

    const assistantMessage = await this.persistMessage({
      id: randomUUID(),
      sessionId: session.id,
      walletId: session.walletId,
      role: 'assistant',
      content: answer.answer,
      toolCalls: answer.toolCalls,
      memoryReferences: [
        ...answer.memoryReads.map((item) => ({ type: 'read', ...item })),
        ...answer.memoryWrites.map((item) => ({ type: 'write', ...item })),
      ],
      timestamp: new Date(),
    });

    await this.touchSession(session.id, assistantMessage.timestamp);

    return {
      session: await this.getSession(session.id),
      userMessage,
      assistantMessage,
      intent: answer.intent,
      analyzedFacts: answer.analyzedFacts,
    };
  }

  async getSession(sessionId: string) {
    const model = this.databaseService.getModel<Record<string, unknown>>('ChatSession');
    if (!model) {
      const session = this.fallbackSessions.get(sessionId);
      if (!session) {
        throw new NotFoundException('Chat session not found.');
      }

      return session;
    }

    const session = await model.findById(sessionId).lean<Record<string, unknown> | null>();
    if (!session) {
      throw new NotFoundException('Chat session not found.');
    }

    return this.mapSessionDocument(session);
  }

  async listSessions(walletId: string, pagination: PaginationParams): Promise<PaginationResult<ChatSessionRecord>> {
    const model = this.databaseService.getModel<Record<string, unknown>>('ChatSession');
    if (!model) {
      const items = Array.from(this.fallbackSessions.values())
        .filter((session) => session.walletId === walletId)
        .sort((left, right) => right.lastMessageAt.getTime() - left.lastMessageAt.getTime());
      const paged = items.slice(pagination.skip, pagination.skip + pagination.limit);
      return buildPaginationResult(paged, items.length, pagination);
    }

    const [items, total] = await Promise.all([
      model
        .find({ walletId })
        .sort({ lastMessageAt: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean<Record<string, unknown>[]>(),
      model.countDocuments({ walletId }),
    ]);

    return buildPaginationResult(items.map((item) => this.mapSessionDocument(item)), total, pagination);
  }

  async getConversationHistory(sessionId: string, pagination: PaginationParams): Promise<PaginationResult<ChatMessageRecord>> {
    await this.getSession(sessionId);

    const model = this.databaseService.getModel<Record<string, unknown>>('ChatMessage');
    if (!model) {
      const items = (this.fallbackMessages.get(sessionId) ?? []).sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime());
      const paged = items.slice(pagination.skip, pagination.skip + pagination.limit);
      return buildPaginationResult(paged, items.length, pagination);
    }

    const [items, total] = await Promise.all([
      model
        .find({ sessionId })
        .sort({ timestamp: 1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean<Record<string, unknown>[]>(),
      model.countDocuments({ sessionId }),
    ]);

    return buildPaginationResult(items.map((item) => this.mapMessageDocument(item)), total, pagination);
  }

  private async persistMessage(message: ChatMessageRecord) {
    const model = this.databaseService.getModel<Record<string, unknown>>('ChatMessage');
    if (!model) {
      const list = this.fallbackMessages.get(message.sessionId) ?? [];
      list.push(message);
      this.fallbackMessages.set(message.sessionId, list);
      return message;
    }

    const created = await model.create({
      sessionId: message.sessionId,
      walletId: message.walletId,
      role: message.role,
      content: message.content,
      toolCalls: message.toolCalls,
      memoryReferences: message.memoryReferences,
      timestamp: message.timestamp,
    });

    return this.mapMessageDocument(created.toObject<Record<string, unknown>>());
  }

  private async touchSession(sessionId: string, timestamp: Date) {
    const model = this.databaseService.getModel<Record<string, unknown>>('ChatSession');
    if (!model) {
      const existing = this.fallbackSessions.get(sessionId);
      if (existing) {
        existing.lastMessageAt = timestamp;
      }
      return;
    }

    await model.findByIdAndUpdate(sessionId, { $set: { lastMessageAt: timestamp } });
  }

  private mapSessionDocument(document: Record<string, unknown>): ChatSessionRecord {
    return {
      id: String(document._id),
      walletId: String(document.walletId),
      title: String(document.title),
      createdAt: toDate(document.createdAt) ?? new Date(),
      lastMessageAt: toDate(document.lastMessageAt) ?? new Date(),
    };
  }

  private mapMessageDocument(document: Record<string, unknown>): ChatMessageRecord {
    return {
      id: String(document._id),
      sessionId: String(document.sessionId),
      walletId: String(document.walletId),
      role: normalizeRole(document.role),
      content: String(document.content ?? ''),
      toolCalls: Array.isArray(document.toolCalls) ? (document.toolCalls as Array<Record<string, unknown>>) : [],
      memoryReferences: Array.isArray(document.memoryReferences)
        ? (document.memoryReferences as Array<Record<string, unknown>>)
        : [],
      timestamp: toDate(document.timestamp) ?? new Date(),
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

function normalizeRole(value: unknown): ChatMessageRecord['role'] {
  return value === 'assistant' || value === 'system' || value === 'tool' ? value : 'user';
}
