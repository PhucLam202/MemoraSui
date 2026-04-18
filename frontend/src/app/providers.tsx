'use client';

import { DAppKitProvider } from '@mysten/dapp-kit-react';
import type React from 'react';
import { dAppKit } from './dapp-kit';

export default function Providers({ children }: { children: React.ReactNode }) {
  return <DAppKitProvider dAppKit={dAppKit}>{children}</DAppKitProvider>;
}
