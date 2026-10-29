export type ProviderType = 'google_maps' | 'scraper';

export interface SearchQueryParams {
  query: string;
  location?: string;
  limit?: number;
  filters?: Record<string, any>;
}

export interface UnifiedSearchRequest {
  provider_type: ProviderType;
  params: SearchQueryParams;
}

export interface SearchResultItem {
  id: string;
  title: string;
  subtitle?: string;
  address?: string;
  website?: string;
  phone?: string;
  rating?: number;
  reviews_count?: number;
  provider: ProviderType;
  raw_data: Record<string, any>;
}

export interface StandardizedSearchResponse {
  provider: ProviderType;
  results: SearchResultItem[];
  total_count: number;
  execution_time_ms: number;
  error?: string;
}
