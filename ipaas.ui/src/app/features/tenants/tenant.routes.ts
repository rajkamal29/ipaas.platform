import type { Routes } from '@angular/router';

export const tenantRoutes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Tenants | iPaaS',
    loadComponent: () => import('./pages/tenant-list').then((m) => m.TenantList),
  },
  {
    path: 'new',
    title: 'Create tenant | iPaaS',
    loadComponent: () => import('./pages/tenant-create').then((m) => m.TenantCreate),
  },
  {
    path: ':tenantId/sync-requests/new',
    title: 'Create sync request | iPaaS',
    loadComponent: () =>
      import('../sync-requests/pages/sync-request-create').then((m) => m.SyncRequestCreate),
  },
  {
    path: ':tenantId/sync-requests/:requestId/entities/new',
    title: 'Add sync entity | iPaaS',
    loadComponent: () =>
      import('../sync-entities/pages/sync-entity-create').then((m) => m.SyncEntityCreate),
  },
  {
    path: ':tenantId/sync-requests/:requestId',
    title: 'Sync request | iPaaS',
    loadComponent: () =>
      import('../sync-requests/pages/sync-request-detail').then((m) => m.SyncRequestDetail),
  },
  {
    path: ':tenantId',
    title: 'Tenant | iPaaS',
    loadComponent: () => import('./pages/tenant-detail').then((m) => m.TenantDetail),
  },
];
