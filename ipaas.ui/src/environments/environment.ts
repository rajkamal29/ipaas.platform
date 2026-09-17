import type { AppConfig } from '../app/core/config/app-config';

export const environment = {
  production: true,
  appName: 'iPaaS',
  dataMode: 'http',
  apiBaseUrl: '/api',
} as const satisfies AppConfig;
