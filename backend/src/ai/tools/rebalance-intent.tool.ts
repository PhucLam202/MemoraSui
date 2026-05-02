import { Injectable, Logger } from '@nestjs/common';
import { DEFAULT_KEEP_GAS_MIST, parseOptionalKeepGas } from './defi-utils';
import { validateRebalanceIntent } from './defi-security-guard';

export type RebalanceTarget = {
  token: string;
  targetPct: number;
};

export type RebalanceIntentRequest = {
  targets: RebalanceTarget[];
  keepGasMist: string;
  network: string;
};

function parseTargets(question: string): RebalanceTarget[] {
  const matches = question.matchAll(/(\d+(?:[.,]\d+)?)\s*%\s*([a-z0-9:_]+)/gi);
  const targets: RebalanceTarget[] = [];
  for (const match of matches) {
    if (!match[1] || !match[2]) {
      continue;
    }
    const targetPct = parseFloat(match[1].replace(',', '.'));
    if (!Number.isFinite(targetPct) || targetPct <= 0) {
      continue;
    }
    targets.push({
      token: match[2].trim(),
      targetPct,
    });
  }
  return targets;
}

@Injectable()
export class RebalanceIntentTool {
  private readonly logger = new Logger(RebalanceIntentTool.name);

  parseRebalance(question: string, network: string): RebalanceIntentRequest | null {
    const targets = parseTargets(question).map((target) => ({
      token: target.token.trim().toUpperCase(),
      targetPct: target.targetPct,
    }));
    const validated = validateRebalanceIntent({
      targets,
      keepGasMist: parseOptionalKeepGas(question) ?? DEFAULT_KEEP_GAS_MIST,
    });
    if (!validated.ok) {
      this.logger.warn(`Rebalance intent rejected by security guard (code=${validated.rejectCode}).`);
      return null;
    }

    return {
      targets: validated.value.targets,
      keepGasMist: validated.value.keepGasMist.toString(),
      network,
    };
  }
}
