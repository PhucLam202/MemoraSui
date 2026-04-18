'use client';

import dynamic from 'next/dynamic';

const WalletShell = dynamic(() => import('./wallet-shell'), {
  ssr: false,
});

export default WalletShell;
