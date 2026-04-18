import { Injectable } from '@nestjs/common';

type TimedResult = { ok: boolean; latencyMs: number; timestamp: number };

@Injectable()
export class MetricsService {
  private rpc: TimedResult[] = [];
  private ai: TimedResult[] = [];
  private sync: Array<{ status: 'completed' | 'failed'; timestamp: number }> = [];

  recordRpcCall(ok: boolean, latencyMs: number) {
    this.rpc.push({ ok, latencyMs, timestamp: Date.now() });
    this.rpc = this.rpc.slice(-1000);
  }

  recordAiCall(ok: boolean, latencyMs: number) {
    this.ai.push({ ok, latencyMs, timestamp: Date.now() });
    this.ai = this.ai.slice(-1000);
  }

  recordSyncJob(status: 'completed' | 'failed') {
    this.sync.push({ status, timestamp: Date.now() });
    this.sync = this.sync.slice(-1000);
  }

  getSnapshot() {
    const rpcErrors = this.rpc.filter((item) => !item.ok).length;
    const syncFailures = this.sync.filter((item) => item.status === 'failed').length;
    const avgAiLatency = this.ai.length === 0 ? 0 : this.ai.reduce((sum, item) => sum + item.latencyMs, 0) / this.ai.length;

    return {
      rpc: {
        calls: this.rpc.length,
        errorRate: this.rpc.length === 0 ? 0 : rpcErrors / this.rpc.length,
      },
      sync: {
        jobs: this.sync.length,
        failureRate: this.sync.length === 0 ? 0 : syncFailures / this.sync.length,
      },
      ai: {
        calls: this.ai.length,
        averageLatencyMs: Number(avgAiLatency.toFixed(1)),
      },
    };
  }
}
