import { z } from 'zod';

const booleanFlag = z.preprocess((value) => {
  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();

  return ['1', 'true', 'yes', 'on'].includes(normalized);
}, z.boolean());

const backendEnvSchema = z.object({
  APP_NAME: z.string().default('Sui Portfolio Assistant API'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  API_PREFIX: z.string().min(1).default('api'),
  FRONTEND_ORIGIN: z.string().url().default('http://localhost:3000'),
  SUI_NETWORK: z.enum(['devnet', 'testnet', 'mainnet']).default('testnet'),
  SUI_RPC_URL: z.string().default(''),
  SUI_RPC_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
  SUI_RPC_MAX_RETRIES: z.coerce.number().int().min(0).default(3),
  SUI_RPC_RATE_LIMIT_PER_SECOND: z.coerce.number().int().positive().default(10),
  SUI_CACHE_BALANCE_TTL_SECONDS: z.coerce.number().int().positive().default(30),
  SUI_CACHE_OBJECT_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  SUI_CACHE_TRANSACTION_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  SUI_CACHE_EVENT_TTL_SECONDS: z.coerce.number().int().positive().default(120),
  SUI_CACHE_STALE_SECONDS: z.coerce.number().int().min(0).default(300),
  SUI_SYNC_PAGE_SIZE: z.coerce.number().int().positive().default(50),
  MONGODB_ENABLED: booleanFlag.default(false),
  MONGODB_URI: z.string().default('mongodb://127.0.0.1:27017/sui-portfolio'),
  REDIS_ENABLED: booleanFlag.default(false),
  REDIS_URL: z.string().default('redis://127.0.0.1:6379'),
  QUEUE_NAME: z.string().min(1).default('wallet-sync'),
  AUTH_TOKEN_SECRET: z.string().min(16).default('dev-only-change-me'),
  AUTH_CHALLENGE_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  AUTH_SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(1800),
  AUTH_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(1800),
  AUTH_CHALLENGE_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(30),
  AUTH_VERIFY_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(30),
  AUTH_REFRESH_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(60),
  AUTH_REPLAY_WINDOW_SECONDS: z.coerce.number().int().positive().default(600),
  AI_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(120),
  MEMWAL_ENABLED: booleanFlag.default(false),
  MEMWAL_KEY: z.string().default(''),
  MEMWAL_ACCOUNT_ID: z.string().default(''),
  MEMWAL_SERVER_URL: z.string().url().default('https://relayer.memwal.ai'),
  MEMWAL_NAMESPACE: z.string().min(1).default('wallet-chat'),
  MEMWAL_RATE_LIMIT_PER_SECOND: z.coerce.number().int().positive().default(10),
});

const parsedEnv = backendEnvSchema.parse(process.env);

export const backendEnv = {
  appName: parsedEnv.APP_NAME,
  nodeEnv: parsedEnv.NODE_ENV,
  port: parsedEnv.PORT,
  apiPrefix: parsedEnv.API_PREFIX,
  frontendOrigin: parsedEnv.FRONTEND_ORIGIN,
  network: parsedEnv.SUI_NETWORK,
  sui: {
    rpcUrl: parsedEnv.SUI_RPC_URL,
    timeoutMs: parsedEnv.SUI_RPC_TIMEOUT_MS,
    maxRetries: parsedEnv.SUI_RPC_MAX_RETRIES,
    rateLimitPerSecond: parsedEnv.SUI_RPC_RATE_LIMIT_PER_SECOND,
    pageSize: parsedEnv.SUI_SYNC_PAGE_SIZE,
    cache: {
      balanceTtlSeconds: parsedEnv.SUI_CACHE_BALANCE_TTL_SECONDS,
      objectTtlSeconds: parsedEnv.SUI_CACHE_OBJECT_TTL_SECONDS,
      transactionTtlSeconds: parsedEnv.SUI_CACHE_TRANSACTION_TTL_SECONDS,
      eventTtlSeconds: parsedEnv.SUI_CACHE_EVENT_TTL_SECONDS,
      staleSeconds: parsedEnv.SUI_CACHE_STALE_SECONDS,
    },
  },
  mongodb: {
    enabled: parsedEnv.MONGODB_ENABLED,
    uri: parsedEnv.MONGODB_URI,
  },
  redis: {
    enabled: parsedEnv.REDIS_ENABLED,
    url: parsedEnv.REDIS_URL,
  },
  queueName: parsedEnv.QUEUE_NAME,
  auth: {
    tokenSecret: parsedEnv.AUTH_TOKEN_SECRET,
    challengeTtlSeconds: parsedEnv.AUTH_CHALLENGE_TTL_SECONDS,
    sessionTtlSeconds: parsedEnv.AUTH_SESSION_TTL_SECONDS,
    refreshTtlSeconds: parsedEnv.AUTH_REFRESH_TTL_SECONDS,
    challengeRateLimitPerMinute: parsedEnv.AUTH_CHALLENGE_RATE_LIMIT_PER_MINUTE,
    verifyRateLimitPerMinute: parsedEnv.AUTH_VERIFY_RATE_LIMIT_PER_MINUTE,
    refreshRateLimitPerMinute: parsedEnv.AUTH_REFRESH_RATE_LIMIT_PER_MINUTE,
    replayWindowSeconds: parsedEnv.AUTH_REPLAY_WINDOW_SECONDS,
  },
  ai: {
    rateLimitPerMinute: parsedEnv.AI_RATE_LIMIT_PER_MINUTE,
  },
  memwal: {
    enabled: parsedEnv.MEMWAL_ENABLED,
    key: parsedEnv.MEMWAL_KEY,
    accountId: parsedEnv.MEMWAL_ACCOUNT_ID,
    serverUrl: parsedEnv.MEMWAL_SERVER_URL,
    namespace: parsedEnv.MEMWAL_NAMESPACE,
    rateLimitPerSecond: parsedEnv.MEMWAL_RATE_LIMIT_PER_SECOND,
  },
} as const;
