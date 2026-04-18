import { Injectable } from '@nestjs/common';
import { backendEnv } from '../config/env';
import type { SuiSyncMode, SuiSyncWindow } from './sui.types';

export interface SuiSyncPlanInput {
  startCursor?: string | null;
  endCursor?: string | null;
  startTime?: number | null;
  endTime?: number | null;
  limit?: number;
}

@Injectable()
export class SuiSyncPlannerService {
  createBackfillPlan(input: SuiSyncPlanInput = {}): SuiSyncWindow {
    return this.createWindow('backfill', input);
  }

  createIncrementalPlan(input: SuiSyncPlanInput = {}): SuiSyncWindow {
    return this.createWindow('incremental', input);
  }

  nextCursor(previousCursor: string | null | undefined, currentCursor: string | null | undefined) {
    if (!currentCursor || currentCursor === previousCursor) {
      return previousCursor ?? null;
    }

    return currentCursor;
  }

  normalizeResumeCursor(cursor: string | null | undefined) {
    return cursor?.trim() || null;
  }

  private createWindow(mode: SuiSyncMode, input: SuiSyncPlanInput): SuiSyncWindow {
    return {
      mode,
      startCursor: input.startCursor ?? null,
      endCursor: input.endCursor ?? null,
      startTime: input.startTime ?? null,
      endTime: input.endTime ?? null,
      limit: input.limit ?? backendEnv.sui.pageSize,
    };
  }
}
