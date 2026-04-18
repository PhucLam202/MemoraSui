import { createHash, createHmac, randomUUID } from 'crypto';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { backendEnv } from '../config/env';
import { DatabaseService } from '../database/database.service';
import { SuiClientService } from '../sui/sui-client.service';

type SuiNetwork = 'devnet' | 'testnet' | 'mainnet';

type RequestMetadata = {
  ipAddress?: string;
  userAgent?: string;
};

type ChallengeRecord = {
  address: string;
  appName: string;
  challenge: string;
  challengeHash: string;
  expiresAt: Date;
  issuedAt: Date;
  network: SuiNetwork;
  nonce: string;
};

type UserRecord = {
  id: string;
  lastAuthenticatedAt?: Date;
  network: SuiNetwork;
  primaryWalletAddress: string;
  sessionMetadata?: {
    lastSeenAt?: Date;
    lastSessionId?: string;
    lastWalletName?: string;
  };
  walletAddresses: string[];
};

type WalletRecord = {
  address: string;
  id: string;
  isPrimary: boolean;
  label?: string;
  lastAuthenticatedAt?: Date;
  network: SuiNetwork;
  userId: string;
};

type SessionRecord = {
  challengeHash: string;
  createdAt: Date;
  expiresAt: Date;
  id: string;
  ipAddress?: string;
  lastRefreshedAt?: Date;
  network: SuiNetwork;
  nonce: string;
  refreshExpiresAt: Date;
  revokedAt?: Date;
  status: 'active' | 'expired' | 'revoked';
  tokenVersion: number;
  userAgent?: string;
  userId: string;
  walletAddress: string;
  walletName?: string;
};

type AccessTokenPayload = {
  address: string;
  exp: number;
  iat: number;
  network: SuiNetwork;
  sid: string;
  sub: string;
  type: 'access' | 'refresh';
  ver: number;
};

const requestChallengeSchema = {
  parse(input: unknown) {
    if (!isRecord(input)) {
      throw new BadRequestException('Request body must be an object.');
    }

    const address = normalizeAddress(input.address);
    const network = parseNetwork(input.network);
    const appName = typeof input.appName === 'string' && input.appName.trim().length > 0
      ? input.appName.trim()
      : backendEnv.appName;

    return {
      address,
      appName,
      network,
    };
  },
};

const verifyChallengeSchema = {
  parse(input: unknown) {
    if (!isRecord(input)) {
      throw new BadRequestException('Request body must be an object.');
    }

    return {
      address: normalizeAddress(input.address),
      challenge: parseNonEmptyString(input.challenge, 'challenge'),
      network: parseNetwork(input.network),
      signature: parseNonEmptyString(input.signature, 'signature'),
      walletName: parseOptionalString(input.walletName),
    };
  },
};

const refreshSessionSchema = {
  parse(input: unknown) {
    if (!isRecord(input)) {
      throw new BadRequestException('Request body must be an object.');
    }

    return {
      refreshToken: parseNonEmptyString(input.refreshToken, 'refreshToken'),
    };
  },
};

@Injectable()
export class AuthService {
  private readonly pendingChallenges = new Map<string, ChallengeRecord>();
  private readonly users = new Map<string, UserRecord>();
  private readonly wallets = new Map<string, WalletRecord>();
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly requestBuckets = new Map<string, number[]>();
  private readonly usedSignatureHashes = new Map<string, number>();

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly suiClientService: SuiClientService,
  ) {}

  createChallenge(input: unknown, _request: RequestMetadata) {
    this.pruneExpiredState();

    const { address, appName, network } = requestChallengeSchema.parse(input);
    this.enforceRateLimit(
      `challenge:${_request.ipAddress ?? 'unknown'}:${address}`,
      backendEnv.auth.challengeRateLimitPerMinute,
      60_000,
    );
    const now = new Date();
    const expiresAt = new Date(now.getTime() + backendEnv.auth.challengeTtlSeconds * 1000);
    const nonce = randomUUID();
    const challenge = [
      `${appName} authentication request`,
      `Wallet: ${address}`,
      `Network: ${network}`,
      `Nonce: ${nonce}`,
      `Issued at: ${now.toISOString()}`,
      `Expires at: ${expiresAt.toISOString()}`,
      'Sign this message to continue.',
    ].join('\n');

    const record: ChallengeRecord = {
      address,
      appName,
      challenge,
      challengeHash: this.hashValue(challenge),
      expiresAt,
      issuedAt: now,
      network,
      nonce,
    };

    this.pendingChallenges.set(this.challengeKey({ address, challenge, network }), record);

    return {
      challenge,
      expiresAt: expiresAt.toISOString(),
      issuedAt: now.toISOString(),
      nonce,
      status: 'pending' as const,
    };
  }

  async verifyChallenge(input: unknown, request: RequestMetadata) {
    this.pruneExpiredState();

    const { address, challenge, network, signature, walletName } = verifyChallengeSchema.parse(input);
    this.enforceRateLimit(
      `verify:${request.ipAddress ?? 'unknown'}:${address}`,
      backendEnv.auth.verifyRateLimitPerMinute,
      60_000,
    );
    const challengeRecord = this.pendingChallenges.get(this.challengeKey({ address, challenge, network }));

    if (!challengeRecord) {
      throw new UnauthorizedException('Challenge is missing or no longer valid.');
    }

    if (challengeRecord.expiresAt.getTime() <= Date.now()) {
      this.pendingChallenges.delete(this.challengeKey({ address, challenge, network }));
      throw new UnauthorizedException('Challenge has expired.');
    }

    const signatureHash = this.hashValue(`${address}:${network}:${signature}`);
    if (this.usedSignatureHashes.has(signatureHash)) {
      throw new UnauthorizedException('Signature replay detected.');
    }

    await this.assertValidSuiSignature({
      address,
      challenge,
      signature,
    });

    const now = new Date();
    const user = await this.findOrCreateUser({
      address,
      authenticatedAt: now,
      network,
      walletName,
    });

    const session = await this.createSession({
      challengeRecord,
      network,
      request,
      user,
      walletName,
    });
    const wallet = await this.getWalletByAddress(address, network);

    this.pendingChallenges.delete(this.challengeKey({ address, challenge, network }));
    this.usedSignatureHashes.set(signatureHash, Date.now());

    return {
      accessToken: this.signToken(session, 'access'),
      accessTokenExpiresAt: session.expiresAt.toISOString(),
      backendStatus: 'verified' as const,
      network,
      refreshToken: this.signToken(session, 'refresh'),
      refreshTokenExpiresAt: session.refreshExpiresAt.toISOString(),
      sessionId: session.id,
      status: 'verified' as const,
      user: {
        id: user.id,
        primaryWalletAddress: user.primaryWalletAddress,
        walletAddresses: user.walletAddresses,
      },
      walletId: wallet?.id,
      verifiedAt: now.toISOString(),
      wallet: {
        address,
        network,
        walletName: walletName ?? null,
      },
    };
  }

  async refreshSession(input: unknown, _request: RequestMetadata) {
    this.pruneExpiredState();
    this.enforceRateLimit(
      `refresh:${_request.ipAddress ?? 'unknown'}`,
      backendEnv.auth.refreshRateLimitPerMinute,
      60_000,
    );

    const { refreshToken } = refreshSessionSchema.parse(input);
    const payload = this.verifySignedToken(refreshToken, 'refresh');
    const session = await this.getSessionById(payload.sid);

    if (!session || session.status !== 'active') {
      throw new UnauthorizedException('Session is not active.');
    }

    if (session.refreshExpiresAt.getTime() <= Date.now()) {
      await this.markSessionExpired(session.id);
      throw new UnauthorizedException('Refresh token has expired.');
    }

    if (session.tokenVersion !== payload.ver) {
      throw new UnauthorizedException('Refresh token has been rotated.');
    }

    session.tokenVersion += 1;
    session.lastRefreshedAt = new Date();
    session.expiresAt = new Date(Date.now() + backendEnv.auth.sessionTtlSeconds * 1000);
    session.refreshExpiresAt = new Date(Date.now() + backendEnv.auth.refreshTtlSeconds * 1000);

    await this.persistSession(session);

    return {
      accessToken: this.signToken(session, 'access'),
      accessTokenExpiresAt: session.expiresAt.toISOString(),
      backendStatus: 'verified' as const,
      refreshToken: this.signToken(session, 'refresh'),
      refreshTokenExpiresAt: session.refreshExpiresAt.toISOString(),
      sessionId: session.id,
      status: 'refreshed' as const,
    };
  }

  async revokeSession(input: unknown) {
    const { refreshToken } = refreshSessionSchema.parse(input);
    const payload = this.verifySignedToken(refreshToken, 'refresh');
    const session = await this.getSessionById(payload.sid);

    if (!session) {
      return {
        revoked: false,
      };
    }

    session.status = 'revoked';
    session.revokedAt = new Date();
    await this.persistSession(session);

    return {
      revoked: true,
      sessionId: session.id,
      status: session.status,
    };
  }

  private async assertValidSuiSignature({
    address,
    challenge,
    signature,
  }: {
    address: string;
    challenge: string;
    signature: string;
  }) {
    try {
      const verifyModule = (await new Function(
        'specifier',
        'return import(specifier);',
      )('@mysten/sui/verify')) as {
        verifyPersonalMessageSignature: (
          message: Uint8Array,
          signature: string,
          options?: { address?: string; client?: unknown },
        ) => Promise<unknown>;
      };

      const messageBytes = new TextEncoder().encode(challenge);
      await verifyModule.verifyPersonalMessageSignature(messageBytes, signature, {
        address,
        client: this.suiClientService.getClient(),
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown signature verification error';
      throw new UnauthorizedException(`Wallet signature verification failed: ${detail}`);
    }
  }

  private async findOrCreateUser({
    address,
    authenticatedAt,
    network,
    walletName,
  }: {
    address: string;
    authenticatedAt: Date;
    network: SuiNetwork;
    walletName?: string;
  }): Promise<UserRecord> {
    const existingWallet = await this.getWalletByAddress(address, network);
    if (existingWallet) {
      const existingUser = await this.getUserById(existingWallet.userId);
      if (!existingUser) {
        throw new InternalServerErrorException('Wallet record exists without a linked user.');
      }

      existingWallet.label = walletName ?? existingWallet.label;
      existingWallet.lastAuthenticatedAt = authenticatedAt;
      await this.persistWallet(existingWallet);

      const nextAddresses = Array.from(new Set([...existingUser.walletAddresses, address]));
      existingUser.walletAddresses = nextAddresses;
      existingUser.lastAuthenticatedAt = authenticatedAt;
      existingUser.sessionMetadata = {
        ...existingUser.sessionMetadata,
        lastSeenAt: authenticatedAt,
        lastWalletName: walletName ?? existingUser.sessionMetadata?.lastWalletName,
      };
      await this.persistUser(existingUser);

      return existingUser;
    }

    const createdUser: UserRecord = {
      id: randomUUID(),
      lastAuthenticatedAt: authenticatedAt,
      network,
      primaryWalletAddress: address,
      sessionMetadata: {
        lastSeenAt: authenticatedAt,
        lastWalletName: walletName,
      },
      walletAddresses: [address],
    };

    const createdWallet: WalletRecord = {
      address,
      id: randomUUID(),
      isPrimary: true,
      label: walletName,
      lastAuthenticatedAt: authenticatedAt,
      network,
      userId: createdUser.id,
    };

    await this.persistUser(createdUser);
    await this.persistWallet(createdWallet);

    return createdUser;
  }

  private async createSession({
    challengeRecord,
    network,
    request,
    user,
    walletName,
  }: {
    challengeRecord: ChallengeRecord;
    network: SuiNetwork;
    request: RequestMetadata;
    user: UserRecord;
    walletName?: string;
  }): Promise<SessionRecord> {
    const now = new Date();
    const session: SessionRecord = {
      challengeHash: challengeRecord.challengeHash,
      createdAt: now,
      expiresAt: new Date(now.getTime() + backendEnv.auth.sessionTtlSeconds * 1000),
      id: randomUUID(),
      ipAddress: request.ipAddress,
      network,
      nonce: challengeRecord.nonce,
      refreshExpiresAt: new Date(now.getTime() + backendEnv.auth.refreshTtlSeconds * 1000),
      status: 'active',
      tokenVersion: 1,
      userAgent: request.userAgent,
      userId: user.id,
      walletAddress: challengeRecord.address,
      walletName,
    };

    user.lastAuthenticatedAt = now;
    user.sessionMetadata = {
      lastSeenAt: now,
      lastSessionId: session.id,
      lastWalletName: walletName ?? user.sessionMetadata?.lastWalletName,
    };

    await this.persistUser(user);
    await this.persistSession(session);

    return session;
  }

  private signToken(session: SessionRecord, type: 'access' | 'refresh') {
    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresAt = type === 'access'
      ? Math.floor(session.expiresAt.getTime() / 1000)
      : Math.floor(session.refreshExpiresAt.getTime() / 1000);

    const payload: AccessTokenPayload = {
      address: session.walletAddress,
      exp: expiresAt,
      iat: issuedAt,
      network: session.network,
      sid: session.id,
      sub: session.userId,
      type,
      ver: session.tokenVersion,
    };

    const encodedPayload = this.encodeBase64Url(JSON.stringify(payload));
    const signature = createHmac('sha256', backendEnv.auth.tokenSecret)
      .update(encodedPayload)
      .digest('base64url');

    return `${encodedPayload}.${signature}`;
  }

  private verifySignedToken(token: string, expectedType: 'access' | 'refresh') {
    const [encodedPayload, providedSignature] = token.split('.');
    if (!encodedPayload || !providedSignature) {
      throw new UnauthorizedException('Token format is invalid.');
    }

    const expectedSignature = createHmac('sha256', backendEnv.auth.tokenSecret)
      .update(encodedPayload)
      .digest('base64url');

    if (expectedSignature !== providedSignature) {
      throw new UnauthorizedException('Token signature is invalid.');
    }

    let payload: AccessTokenPayload;
    try {
      payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf-8')) as AccessTokenPayload;
    } catch {
      throw new UnauthorizedException('Token payload is invalid.');
    }

    if (payload.type !== expectedType) {
      throw new UnauthorizedException(`Expected a ${expectedType} token.`);
    }

    if (payload.exp <= Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException('Token has expired.');
    }

    return payload;
  }

  private pruneExpiredState() {
    const now = Date.now();

    for (const [key, challenge] of this.pendingChallenges.entries()) {
      if (challenge.expiresAt.getTime() <= now) {
        this.pendingChallenges.delete(key);
      }
    }

    for (const session of this.sessions.values()) {
      if (session.status === 'active' && session.refreshExpiresAt.getTime() <= now) {
        session.status = 'expired';
      }
    }

    for (const [key, timestamps] of this.requestBuckets.entries()) {
      const recent = timestamps.filter((timestamp) => now - timestamp <= 60_000);
      if (recent.length === 0) {
        this.requestBuckets.delete(key);
      } else {
        this.requestBuckets.set(key, recent);
      }
    }

    const replayWindowMs = backendEnv.auth.replayWindowSeconds * 1000;
    for (const [signatureHash, createdAt] of this.usedSignatureHashes.entries()) {
      if (now - createdAt > replayWindowMs) {
        this.usedSignatureHashes.delete(signatureHash);
      }
    }
  }

  private enforceRateLimit(key: string, limit: number, windowMs: number) {
    const now = Date.now();
    const bucket = this.requestBuckets.get(key) ?? [];
    const recent = bucket.filter((timestamp) => now - timestamp <= windowMs);
    if (recent.length >= limit) {
      throw new UnauthorizedException('Too many requests. Please retry later.');
    }

    recent.push(now);
    this.requestBuckets.set(key, recent);
  }

  private challengeKey({
    address,
    challenge,
    network,
  }: {
    address: string;
    challenge: string;
    network: SuiNetwork;
  }) {
    return `${network}:${address}:${this.hashValue(challenge)}`;
  }

  private hashValue(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private encodeBase64Url(value: string) {
    return Buffer.from(value, 'utf-8').toString('base64url');
  }

  private async getUserById(userId: string) {
    const userModel = this.databaseService.getModel<Record<string, unknown>>('User');
    if (!userModel) {
      return this.users.get(userId) ?? null;
    }

    const user = await userModel.findById(userId).lean<Record<string, unknown> | null>();
    return user ? this.mapUserDocument(user) : null;
  }

  private async getWalletByAddress(address: string, network: SuiNetwork) {
    const walletModel = this.databaseService.getModel<Record<string, unknown>>('Wallet');
    if (!walletModel) {
      return this.wallets.get(this.walletKey(address, network)) ?? null;
    }

    const wallet = await walletModel.findOne({ address, network }).lean<Record<string, unknown> | null>();
    return wallet ? this.mapWalletDocument(wallet) : null;
  }

  private async getSessionById(sessionId: string) {
    const sessionModel = this.databaseService.getModel<Record<string, unknown>>('AuthSession');
    if (!sessionModel) {
      return this.sessions.get(sessionId) ?? null;
    }

    const session = await sessionModel.findOne({ sessionId }).lean<Record<string, unknown> | null>();
    return session ? this.mapSessionDocument(session) : null;
  }

  private async persistUser(user: UserRecord) {
    const userModel = this.databaseService.getModel<Record<string, unknown>>('User');
    if (!userModel) {
      this.users.set(user.id, user);
      return;
    }

    await userModel.findByIdAndUpdate(
      user.id,
      {
        _id: user.id,
        lastAuthenticatedAt: user.lastAuthenticatedAt,
        network: user.network,
        primaryWalletAddress: user.primaryWalletAddress,
        sessionMetadata: user.sessionMetadata,
        walletAddresses: user.walletAddresses,
      },
      {
        new: true,
        upsert: true,
      },
    );
  }

  private async persistWallet(wallet: WalletRecord) {
    const walletModel = this.databaseService.getModel<Record<string, unknown>>('Wallet');
    if (!walletModel) {
      this.wallets.set(this.walletKey(wallet.address, wallet.network), wallet);
      return;
    }

    await walletModel.findOneAndUpdate(
      {
        address: wallet.address,
        network: wallet.network,
      },
      {
        address: wallet.address,
        isPrimary: wallet.isPrimary,
        label: wallet.label,
        lastAuthenticatedAt: wallet.lastAuthenticatedAt,
        network: wallet.network,
        userId: wallet.userId,
      },
      {
        new: true,
        upsert: true,
      },
    );
  }

  private async persistSession(session: SessionRecord) {
    const sessionModel = this.databaseService.getModel<Record<string, unknown>>('AuthSession');
    if (!sessionModel) {
      this.sessions.set(session.id, session);
      return;
    }

    await sessionModel.findOneAndUpdate(
      {
        sessionId: session.id,
      },
      {
        challengeHash: session.challengeHash,
        expiresAt: session.expiresAt,
        ipAddress: session.ipAddress,
        lastRefreshedAt: session.lastRefreshedAt,
        network: session.network,
        nonce: session.nonce,
        refreshExpiresAt: session.refreshExpiresAt,
        revokedAt: session.revokedAt,
        sessionId: session.id,
        status: session.status,
        tokenVersion: session.tokenVersion,
        userAgent: session.userAgent,
        userId: session.userId,
        walletAddress: session.walletAddress,
        walletName: session.walletName,
      },
      {
        new: true,
        upsert: true,
      },
    );
  }

  private async markSessionExpired(sessionId: string) {
    const session = await this.getSessionById(sessionId);
    if (!session) {
      return;
    }

    session.status = 'expired';
    await this.persistSession(session);
  }

  private mapUserDocument(document: Record<string, unknown>): UserRecord {
    return {
      id: String(document._id),
      lastAuthenticatedAt: toOptionalDate(document.lastAuthenticatedAt),
      network: parseNetwork(document.network),
      primaryWalletAddress: normalizeAddress(document.primaryWalletAddress),
      sessionMetadata: isRecord(document.sessionMetadata)
        ? {
            lastSeenAt: toOptionalDate(document.sessionMetadata.lastSeenAt),
            lastSessionId: typeof document.sessionMetadata.lastSessionId === 'string'
              ? document.sessionMetadata.lastSessionId
              : undefined,
            lastWalletName: typeof document.sessionMetadata.lastWalletName === 'string'
              ? document.sessionMetadata.lastWalletName
              : undefined,
          }
        : undefined,
      walletAddresses: Array.isArray(document.walletAddresses)
        ? document.walletAddresses
            .filter((value): value is string => typeof value === 'string')
            .map(normalizeAddress)
        : [],
    };
  }

  private mapWalletDocument(document: Record<string, unknown>): WalletRecord {
    return {
      address: normalizeAddress(document.address),
      id: String(document._id ?? this.walletKey(normalizeAddress(document.address), parseNetwork(document.network))),
      isPrimary: document.isPrimary !== false,
      label: typeof document.label === 'string' ? document.label : undefined,
      lastAuthenticatedAt: toOptionalDate(document.lastAuthenticatedAt),
      network: parseNetwork(document.network),
      userId: String(document.userId),
    };
  }

  private mapSessionDocument(document: Record<string, unknown>): SessionRecord {
    const status = document.status;
    if (status !== 'active' && status !== 'expired' && status !== 'revoked') {
      throw new InternalServerErrorException('Session status is invalid.');
    }

    return {
      challengeHash: parseNonEmptyString(document.challengeHash, 'challengeHash'),
      createdAt: toDate(document.createdAt, 'createdAt'),
      expiresAt: toDate(document.expiresAt, 'expiresAt'),
      id: parseNonEmptyString(document.sessionId, 'sessionId'),
      ipAddress: typeof document.ipAddress === 'string' ? document.ipAddress : undefined,
      lastRefreshedAt: toOptionalDate(document.lastRefreshedAt),
      network: parseNetwork(document.network),
      nonce: parseNonEmptyString(document.nonce, 'nonce'),
      refreshExpiresAt: toDate(document.refreshExpiresAt, 'refreshExpiresAt'),
      revokedAt: toOptionalDate(document.revokedAt),
      status,
      tokenVersion: toPositiveInteger(document.tokenVersion, 'tokenVersion'),
      userAgent: typeof document.userAgent === 'string' ? document.userAgent : undefined,
      userId: parseNonEmptyString(document.userId, 'userId'),
      walletAddress: normalizeAddress(document.walletAddress),
      walletName: typeof document.walletName === 'string' ? document.walletName : undefined,
    };
  }

  private walletKey(address: string, network: SuiNetwork) {
    return `${network}:${address}`;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseNetwork(value: unknown): SuiNetwork {
  if (value === 'devnet' || value === 'testnet' || value === 'mainnet') {
    return value;
  }

  throw new BadRequestException('network must be one of devnet, testnet, or mainnet.');
}

function parseNonEmptyString(value: unknown, fieldName: string) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new BadRequestException(`${fieldName} must be a non-empty string.`);
  }

  return value.trim();
}

function parseOptionalString(value: unknown) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeAddress(value: unknown) {
  const normalized = parseNonEmptyString(value, 'address').toLowerCase();
  if (normalized.length < 8 || normalized.length > 128) {
    throw new BadRequestException('address has an invalid length.');
  }

  return normalized;
}

function toDate(value: unknown, fieldName: string) {
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw new InternalServerErrorException(`${fieldName} is not a valid date.`);
  }

  return date;
}

function toOptionalDate(value: unknown) {
  if (value === null || value === undefined) {
    return undefined;
  }

  return toDate(value, 'date');
}

function toPositiveInteger(value: unknown, fieldName: string) {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new InternalServerErrorException(`${fieldName} must be a positive integer.`);
  }

  return parsed;
}
