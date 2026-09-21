import { InjectionToken } from '@angular/core';

export interface AppConfig {
  readonly production: boolean;
  readonly appName: string;
  readonly dataMode: 'mock' | 'http';
  readonly apiBaseUrl: string;
}

export const APP_CONFIG = new InjectionToken<AppConfig>('Application configuration');
