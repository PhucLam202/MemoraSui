import 'dotenv/config';
import { Worker, Queue } from 'bullmq';
import IORedis from 'ioredis';
import { z } from 'zod';

const booleanFlag = z.preprocess((value) => {
  if (typeof value === 'boolean') {
    return value;
  }

  return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').toLowerCase());
}, z.boolean());

const env = z
  .object({
    APP_NAME: z.string().default('Sui Portfolio Assistant Worker'),
    BACKEND_INTERNAL_URL: z.string().default('http://127.0.0.1:4000/api'),
    REDIS_ENABLED: booleanFlag.default(false),
    REDIS_URL: z.string().default('redis://127.0.0.1:6379'),
    QUEUE_NAME: z.string().default('wallet-sync'),
  })
  .parse(process.env);

function maskSensitive(value: string) {
  return value
    .replace(/0x[a-fA-F0-9]{8,}/g, (address) => `${address.slice(0, 6)}...${address.slice(-4)}`)
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted-token]')
    .replace(/([A-Za-z0-9+/]{40,}={0,2})/g, '[redacted-signature]');
}

function log(level: 'info' | 'warn' | 'error', message: string, payload?: Record<string, unknown>) {
  if (level === 'info') {
    return;
  }
  const line = JSON.stringify({
    level,
    message: maskSensitive(message),
    payload: payload ?? {},
    ts: new Date().toISOString(),
  });
  if (level === 'error') {
    console.error(line);
    return;
  }
  if (level === 'warn') {
    console.warn(line);
    return;
  }
  console.log(line);
}

async function bootstrap() {
  if (!env.REDIS_ENABLED) {
    log('info', `${env.APP_NAME} is idle. Enable Redis to activate BullMQ processing.`);
    return;
  }

  const originalWarn = console.warn.bind(console);
  console.warn = (...args: unknown[]) => {
    const message = args
      .map((value) => (typeof value === 'string' ? value : String(value)))
      .join(' ');

    if (message.includes('IMPORTANT! Eviction policy is') && message.includes('volatile-lru')) {
      return;
    }

    originalWarn(...args);
  };

  const connection = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
  });

  const queue = new Queue(env.QUEUE_NAME, { connection });

  const worker = new Worker(
    env.QUEUE_NAME,
    async (job) => {
      const jobName = String(job.name ?? '');
      if (jobName === 'wallet-sync-repeat') {
        const walletId = String(job.data?.walletId ?? '');
        if (!walletId) {
          throw new Error('Repeat job payload is missing walletId.');
        }

        log('info', 'Worker processing repeat sync job.', { walletId, queue: env.QUEUE_NAME });
        const backendUrl = env.BACKEND_INTERNAL_URL.replace(/\/+$/, '');
        const response = await fetch(`${backendUrl}/sync/wallets/${walletId}`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-worker-token': 'internal',
          },
          body: JSON.stringify({ walletId }),
        });

        if (!response.ok) {
          const detail = await response.text();
          if (response.status === 404) {
            log('warn', `Wallet ${walletId} not found, removing stale repeat job.`, { walletId });
            const repeatKey = job.repeatJobKey;
            if (repeatKey) {
              await queue.removeRepeatableByKey(repeatKey);
            }
            return;
          }
          throw new Error(`Backend repeat sync failed with ${response.status}: ${detail}`);
        }

        return response.json();
      }

      const jobId = String(job.data?.jobId ?? job.id ?? '');
      if (!jobId) {
        throw new Error('Job payload is missing jobId.');
      }
      log('info', 'Worker processing sync job.', { jobId, queue: env.QUEUE_NAME });

      const backendUrl = env.BACKEND_INTERNAL_URL.replace(/\/+$/, '');
      const response = await fetch(`${backendUrl}/sync/jobs/${jobId}/run`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-worker-token': 'internal',
        },
        body: JSON.stringify({ jobId }),
      });

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`Backend sync failed with ${response.status}: ${detail}`);
      }

      log('info', 'Worker completed sync job.', { jobId, queue: env.QUEUE_NAME });

      return response.json();
    },
    {
      connection,
    },
  );

  worker.on('ready', () => {
    log('info', `${env.APP_NAME} listening on queue ${env.QUEUE_NAME}`);
  });

  worker.on('completed', (job) => {
    log('info', 'Worker job completed event.', { jobId: String(job?.id ?? 'unknown') });
  });

  worker.on('failed', (job, error) => {
    log('error', `Job ${job?.id ?? 'unknown'} failed: ${error.message}`, {
      jobId: String(job?.id ?? 'unknown'),
    });
  });

  const shutdown = async () => {
    await worker.close();
    await queue.close();
    await connection.quit();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((error: unknown) => {
  log('error', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
