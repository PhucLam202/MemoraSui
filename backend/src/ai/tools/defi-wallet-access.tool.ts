import { Injectable } from '@nestjs/common';
import { type SuiNetwork } from '../../sui/sui.types';
import { SuiClientService } from '../../sui/sui-client.service';
import { DEFAULT_KEEP_GAS_MIST, MIN_EXECUTION_GAS_BUDGET_MIST, SUI_COIN_TYPE } from './defi-utils';

type Transaction = any;
type TransactionObjectArgument = any;

type CoinLike = {
  coinObjectId: string;
  balance: string;
  version: string | number;
  digest: string;
};

@Injectable()
export class DefiWalletAccessTool {
  constructor(private readonly suiClientService: SuiClientService) {}

  async ensureSuiGasBalance(
    walletAddress: string,
    network: SuiNetwork,
    minimumGasMist: bigint = MIN_EXECUTION_GAS_BUDGET_MIST,
  ): Promise<void> {
    const coins = await this.loadCoins(walletAddress, SUI_COIN_TYPE, network, minimumGasMist);
    const spendableGas = coins.reduce((sum, coin) => sum + BigInt(coin.balance), 0n);
    if (spendableGas < minimumGasMist) {
      throw new Error(
        `Không tìm thấy SUI gas coin đủ lớn. Cần tối thiểu ${Number(minimumGasMist) / 1_000_000_000} SUI làm gas trước khi ký giao dịch DeFi.`,
      );
    }
  }

  async prepareInputCoin(
    tx: Transaction,
    walletAddress: string,
    coinType: string,
    requiredRawAmount: bigint,
    network: SuiNetwork,
    keepGasMist: bigint = DEFAULT_KEEP_GAS_MIST,
  ): Promise<{ coin: TransactionObjectArgument; totalRawAmount: bigint }> {
    if (coinType === SUI_COIN_TYPE) {
      const coins = await this.loadCoins(walletAddress, coinType, network, requiredRawAmount + keepGasMist);
      const totalBalance = coins.reduce((sum, coin) => sum + BigInt(coin.balance), 0n);
      if (totalBalance < requiredRawAmount + keepGasMist) {
        throw new Error(`Insufficient SUI balance. Need ${requiredRawAmount + keepGasMist} MIST including gas reserve.`);
      }

      // Prefer explicit SUI input coins separated from the gas reserve coin when possible.
      // This avoids wallet-specific gas selection failures when one coin is used in two roles.
      const sortedCoins = [...coins].sort((left, right) => {
        const leftBalance = BigInt(left.balance);
        const rightBalance = BigInt(right.balance);
        if (leftBalance === rightBalance) return 0;
        return leftBalance > rightBalance ? -1 : 1;
      });
      const nonGasCoins = sortedCoins.slice(1);
      const nonGasTotal = nonGasCoins.reduce((sum, coin) => sum + BigInt(coin.balance), 0n);
      const firstNonGasCoin = nonGasCoins[0];
      if (firstNonGasCoin && nonGasTotal >= requiredRawAmount) {
        const primaryCoin = tx.object(firstNonGasCoin.coinObjectId);
        if (nonGasCoins.length > 1) {
          tx.mergeCoins(
            primaryCoin,
            nonGasCoins.slice(1).map((coin) => tx.object(coin.coinObjectId)),
          );
        }
        if (nonGasTotal === requiredRawAmount) {
          return {
            coin: primaryCoin,
            totalRawAmount: totalBalance,
          };
        }
        const [splitCoin] = tx.splitCoins(primaryCoin, [requiredRawAmount]);
        return {
          coin: splitCoin,
          totalRawAmount: totalBalance,
        };
      }

      const [fallbackCoin] = tx.splitCoins(tx.gas, [requiredRawAmount]);
      return {
        coin: fallbackCoin,
        totalRawAmount: totalBalance,
      };
    }

    const coins = await this.loadCoins(walletAddress, coinType, network, requiredRawAmount);
    const totalRawAmount = coins.reduce((sum, coin) => sum + BigInt(coin.balance), 0n);
    if (totalRawAmount < requiredRawAmount) {
      throw new Error(`Insufficient ${coinType} balance. Need ${requiredRawAmount}, found ${totalRawAmount}.`);
    }
    const firstCoin = coins[0];
    if (!firstCoin) {
      throw new Error(`No spendable coin objects found for ${coinType}.`);
    }

    const primaryCoin = tx.object(firstCoin.coinObjectId);
    if (coins.length > 1) {
      tx.mergeCoins(
        primaryCoin,
        coins.slice(1).map((coin) => tx.object(coin.coinObjectId)),
      );
    }

    if (totalRawAmount === requiredRawAmount) {
      return {
        coin: primaryCoin,
        totalRawAmount,
      };
    }

    const [splitCoin] = tx.splitCoins(primaryCoin, [requiredRawAmount]);
    return {
      coin: splitCoin,
      totalRawAmount,
    };
  }

  async findDeepBookAccountCap(walletAddress: string, network: SuiNetwork) {
    const response = (await this.suiClientService.getOwnedObjectsByType(
      walletAddress,
      '0xdee9::custodian_v2::AccountCap',
      undefined,
      10,
      network,
    )) as {
      data?: Array<{ data?: { objectId?: string; object_id?: string }; objectId?: string }>;
    } | null;
    const object = response?.data?.[0];
    const objectId = object?.data?.objectId ?? object?.data?.object_id ?? object?.objectId;
    return typeof objectId === 'string' ? objectId : null;
  }

  async getTotalBalanceByCoinType(walletAddress: string, coinType: string, network: SuiNetwork) {
    const coins = await this.loadCoins(walletAddress, coinType, network, 0n, true);
    return coins.reduce((sum, coin) => sum + BigInt(coin.balance), 0n);
  }

  private async loadCoins(
    walletAddress: string,
    coinType: string,
    network: SuiNetwork,
    minimumRawAmount: bigint,
    loadFullBalance = false,
  ) {
    const loaded: CoinLike[] = [];
    let cursor: string | null | undefined = undefined;
    let total = 0n;

    do {
      const page = (await this.suiClientService.getCoinsByType(walletAddress, coinType, cursor, 50, network)) as {
        data?: CoinLike[];
        nextCursor?: string | null;
        hasNextPage?: boolean;
      } | null;
      const coins = Array.isArray(page?.data) ? (page.data as CoinLike[]) : [];
      for (const coin of coins) {
        loaded.push(coin);
        total += BigInt(coin.balance);
        if (!loadFullBalance && total >= minimumRawAmount) {
          return loaded;
        }
      }
      cursor = typeof page?.nextCursor === 'string' ? page.nextCursor : null;
      if (!page?.hasNextPage) {
        break;
      }
    } while (cursor);

    return loaded;
  }
}
