import type { SUPPORTED_SUI_NETWORKS } from '../constants/app';

export type SuiNetwork = (typeof SUPPORTED_SUI_NETWORKS)[number];

export interface ServiceHealthState {
  enabled: boolean;
  status: 'disabled' | 'idle' | 'ready' | 'error';
  detail: string;
}

export interface HealthPayload {
  appName: string;
  network: SuiNetwork;
  timestamp: string;
  services: {
    api: ServiceHealthState;
    mongodb: ServiceHealthState;
    redis: ServiceHealthState;
    queue: ServiceHealthState;
  };
}
