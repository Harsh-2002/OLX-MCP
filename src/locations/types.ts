import type { LocationDomain } from '../core/domains.js';

export interface LocationMatch {
  readonly id: string;
  readonly name: string;
  readonly type: 'region' | 'city' | 'district' | 'locality';
  readonly searchValue: string;
  readonly parentId?: string;
  readonly region?: string;
}

export interface LocationQuery {
  readonly domain: LocationDomain;
  readonly query: string;
  readonly parentId?: string;
  readonly limit: number;
}

export interface LocationProvider {
  lookup(query: LocationQuery): Promise<LocationMatch[]>;
}
