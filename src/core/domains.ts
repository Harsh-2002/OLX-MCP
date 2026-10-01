/** One source for the domain type, tool schemas, and client-facing descriptions. */
export const OLX_DOMAINS = [
  'olx.pt',
  'olx.pl',
  'olx.bg',
  'olx.ro',
  'olx.ua',
  'olx.in',
  'olx.com.br',
  'olx.co.id',
  'olx.kz',
  'olx.uz',
] as const;

export const LOCATION_DOMAINS = ['olx.in', 'olx.com.br', 'olx.co.id', 'olx.kz', 'olx.uz'] as const;
export type LocationDomain = (typeof LOCATION_DOMAINS)[number];
