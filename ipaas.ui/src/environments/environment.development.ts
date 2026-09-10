import type { AppConfig } from '../app/core/config/app-config';

export const environment = {
  production: false,
  appName: 'iPaaS',
  dataMode: 'mock',
} as const satisfies AppConfig;
