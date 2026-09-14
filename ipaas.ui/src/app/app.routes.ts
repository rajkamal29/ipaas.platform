import { Routes } from '@angular/router';
import { ROUTE_PATHS } from './core/config/navigation';
import { AppShell } from './core/layout/app-shell/app-shell';

export const routes: Routes = [
  {
    path: '',
    component: AppShell,
    children: [
      { path: '', pathMatch: 'full', redirectTo: ROUTE_PATHS.overview },
      {
        path: ROUTE_PATHS.overview,
        title: 'Overview | iPaaS',
        loadComponent: () => import('./features/overview/overview').then((m) => m.Overview),
      },
      {
        path: ROUTE_PATHS.tenants,
        title: 'Tenants | iPaaS',
        loadChildren: () => import('./features/tenants/tenant.routes').then((m) => m.tenantRoutes),
      },
      {
        path: ROUTE_PATHS.globalMappings,
        title: 'Global mappings | iPaaS',
        loadComponent: () =>
          import('./features/global-mappings/global-mappings').then((m) => m.GlobalMappings),
      },
      {
        path: ROUTE_PATHS.canonicalSchemas,
        title: 'Canonical schemas | iPaaS',
        loadComponent: () =>
          import('./features/canonical-schemas/canonical-schemas').then((m) => m.CanonicalSchemas),
      },
      {
        path: '**',
        title: 'Page not found | iPaaS',
        loadComponent: () => import('./core/errors/not-found/not-found').then((m) => m.NotFound),
      },
    ],
  },
];
