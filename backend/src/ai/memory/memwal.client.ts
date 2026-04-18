import { backendEnv } from '../../config/env';

export interface MemWalClientLike {
  remember(text: string, namespace?: string): Promise<{ id: string; blob_id: string; owner: string; namespace: string }>;
  recall(
    query: string,
    limit?: number,
    namespace?: string,
  ): Promise<{ results: Array<{ blob_id: string; text: string; distance: number }>; total: number }>;
  analyze(
    text: string,
    namespace?: string,
  ): Promise<{ facts: Array<{ text: string; id: string; blob_id: string }>; total: number; owner: string }>;
  restore(
    namespace: string,
    limit?: number,
  ): Promise<{ restored: number; skipped: number; total: number; namespace: string; owner: string }>;
  health(): Promise<{ status: string; version: string }>;
}

const importMemWal = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<{
  MemWal: {
    create(config: { key: string; accountId: string; serverUrl?: string; namespace?: string }): MemWalClientLike;
  };
}>;

export async function createMemWalClient() {
  if (!backendEnv.memwal.enabled || !backendEnv.memwal.key || !backendEnv.memwal.accountId) {
    return null;
  }

  const { MemWal } = await importMemWal('@mysten-incubation/memwal');

  return MemWal.create({
    key: backendEnv.memwal.key,
    accountId: backendEnv.memwal.accountId,
    serverUrl: backendEnv.memwal.serverUrl,
    namespace: backendEnv.memwal.namespace,
  });
}
