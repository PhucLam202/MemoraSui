'use client';

import type { HealthPayload, SuiNetwork } from '@sui-portfolio/shared';

import WalletDashboard from './wallet-dashboard';

interface WalletShellProps {
  appName: string;
  apiBaseUrl: string;
  health: HealthPayload | null;
  initialNetwork: SuiNetwork;
}

export default function WalletShell(props: WalletShellProps) {
  return <WalletDashboard {...props} />;
}
