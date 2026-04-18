'use client';

import { createDAppKit } from '@mysten/dapp-kit-react';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import type { SuiNetwork } from '@sui-portfolio/shared';

const GRPC_URLS: Record<SuiNetwork, string> = {
  devnet: 'https://fullnode.devnet.sui.io:443',
  testnet: 'https://fullnode.testnet.sui.io:443',
  mainnet: 'https://fullnode.mainnet.sui.io:443',
};

const defaultNetwork: SuiNetwork = 'testnet';

export const dAppKit = createDAppKit({
  networks: ['testnet'],
  defaultNetwork,
  autoConnect: false,
  storageKey: 'sui-portfolio:dapp-kit',
  slushWalletConfig: null,
  createClient: (network) =>
    new SuiGrpcClient({
      network,
      baseUrl: GRPC_URLS[network],
    }),
});

declare module '@mysten/dapp-kit-react' {
  interface Register {
    dAppKit: typeof dAppKit;
  }
}
