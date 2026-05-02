import { Injectable } from '@nestjs/common';
import { SuiClientService } from '../../sui/sui-client.service';
import { type SuiNetwork } from '../../sui/sui.types';
import { type ExecutionRisk } from '../orchestrator/ai-harness.types';
import { inferSymbolFromCoinType, MIN_EXECUTION_GAS_BUDGET_MIST } from './defi-utils';

type Transaction = any;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { toBase64 } = require('@mysten/sui/utils') as {
  toBase64: (value: Uint8Array) => string;
};

@Injectable()
export class TransactionRiskTool {
  constructor(private readonly suiClientService: SuiClientService) {}

  async buildExecutionArtifacts(input: {
    tx: Transaction;
    sender: string;
    network: SuiNetwork;
    warnings: string[];
    touchedProtocols: string[];
  }): Promise<{
    transactionKindBytesBase64: string;
    transactionJson: string;
    gasEstimateMist?: string;
    risk: ExecutionRisk;
  }> {
    const client = this.suiClientService.getClient(input.network);
    input.tx.setGasBudgetIfNotSet(MIN_EXECUTION_GAS_BUDGET_MIST);
    const transactionKindBytes = await input.tx.build({
      client,
      onlyTransactionKind: true,
    });

    let gasEstimateMist: string | undefined;
    let expectedBalanceChanges: ExecutionRisk['expectedBalanceChanges'] = [];
    let fullTransactionBytes: Uint8Array | undefined;
    let transactionJson = '';
    try {
      fullTransactionBytes = await input.tx.build({ client });
      transactionJson = await input.tx.toJSON({ client });
      const dryRun = (await this.suiClientService.dryRunTransactionBlock(fullTransactionBytes!, input.network)) as {
        effects?: {
          gasUsed?: {
            computationCost?: string;
            storageCost?: string;
            storageRebate?: string;
          };
        };
        balanceChanges?: Array<{
          amount?: string;
          coinType?: string;
          owner?: {
            AddressOwner?: string;
            ObjectOwner?: string;
          };
        }>;
      } | null;
      const gasUsed = dryRun?.effects?.gasUsed;
      if (gasUsed) {
        const computation = BigInt(gasUsed.computationCost ?? '0');
        const storage = BigInt(gasUsed.storageCost ?? '0');
        const rebate = BigInt(gasUsed.storageRebate ?? '0');
        gasEstimateMist = (computation + storage - rebate).toString();
      }

      const balanceChanges = Array.isArray(dryRun?.balanceChanges) ? dryRun.balanceChanges : [];
      expectedBalanceChanges = balanceChanges
        .map((change: {
          amount?: string;
          coinType?: string;
          owner?: {
            AddressOwner?: string;
            ObjectOwner?: string;
          };
        }) => {
          const owner = change?.owner;
          const ownerAddress =
            typeof owner?.AddressOwner === 'string'
              ? owner.AddressOwner
              : typeof owner?.ObjectOwner === 'string'
                ? owner.ObjectOwner
                : null;
          if (ownerAddress !== input.sender) {
            return null;
          }
          const amount = typeof change?.amount === 'string' ? change.amount : null;
          const coinType = typeof change?.coinType === 'string' ? change.coinType : null;
          if (!amount || !coinType) {
            return null;
          }
          return {
            symbol: inferSymbolFromCoinType(coinType),
            amount,
          };
        })
        .filter((item: { symbol: string; amount: string } | null): item is { symbol: string; amount: string } => Boolean(item));
    } catch {
      try {
        const devInspect = (await this.suiClientService.devInspectTransactionBlock(input.tx, input.sender, input.network)) as {
          effects?: {
            status?: {
              status?: string;
              error?: string;
            };
            gasUsed?: {
              computationCost?: string;
            };
          };
        } | null;
        const devInspectError = devInspect?.effects?.status?.error;
        if (typeof devInspectError === 'string' && /UnusedValueWithoutDrop/i.test(devInspectError)) {
          throw new Error(`PTB simulation failed: ${devInspectError}`);
        }
        const computationCost = devInspect?.effects?.gasUsed?.computationCost;
        if (typeof computationCost === 'string') {
          gasEstimateMist = computationCost;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/UnusedValueWithoutDrop/i.test(message)) {
          throw new Error(`PTB simulation failed: ${message}`);
        }
      }
      if (!transactionJson) {
        transactionJson = await input.tx.toJSON({ client });
      }
    }

    // Keep wallet gas selection away from tiny dry-run rebates such as 100000 MIST.
    const estimatedGasMist = gasEstimateMist ? BigInt(gasEstimateMist) : 0n;
    const resolvedGasEstimateMist =
      estimatedGasMist > MIN_EXECUTION_GAS_BUDGET_MIST
        ? estimatedGasMist.toString()
        : MIN_EXECUTION_GAS_BUDGET_MIST.toString();
    return {
      transactionKindBytesBase64: toBase64(transactionKindBytes),
      transactionJson,
      gasEstimateMist: resolvedGasEstimateMist,
      risk: {
        warnings: input.warnings,
        touchedProtocols: input.touchedProtocols,
        gasEstimateMist: resolvedGasEstimateMist,
        expectedBalanceChanges,
      },
    };
  }
}
