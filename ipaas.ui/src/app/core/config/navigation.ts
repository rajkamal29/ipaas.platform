export const ROUTE_PATHS = {
  overview: 'overview',
  tenants: 'tenants',
  globalMappings: 'global-mappings',
  canonicalSchemas: 'canonical-schemas',
} as const;

interface NavigationItem {
  readonly label: string;
  readonly path: string;
  readonly iconPath: string;
}

export const NAVIGATION_ITEMS: readonly NavigationItem[] = [
  {
    label: 'Overview',
    path: ROUTE_PATHS.overview,
    iconPath: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  },
  {
    label: 'Tenants',
    path: ROUTE_PATHS.tenants,
    iconPath: 'M4 21V5l8-2v18 M12 9h8v12 M2 21h20 M7 8h2 M7 12h2 M7 16h2 M15 13h2 M15 17h2',
  },
  {
    label: 'Global mappings',
    path: ROUTE_PATHS.globalMappings,
    iconPath: 'M3 7h16 M15 3l4 4-4 4 M21 17H5 M9 13l-4 4 4 4',
  },
  {
    label: 'Canonical schemas',
    path: ROUTE_PATHS.canonicalSchemas,
    iconPath: 'M8 3H5v18h3 M16 3h3v18h-3 M10 8l-3 4 3 4 M14 8l3 4-3 4',
  },
];
