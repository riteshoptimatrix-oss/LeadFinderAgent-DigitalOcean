import { UnifiedSearchRequest, StandardizedSearchResponse } from '../types/search';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000';

export async function fetchUnifiedSearchResults(
  payload: UnifiedSearchRequest
): Promise<StandardizedSearchResponse> {
  try {
    const response = await fetch(`${BACKEND_URL}/search/unified`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: 'API request failed' }));
      throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
    }

    const data: StandardizedSearchResponse = await response.json();
    return data;
  } catch (error) {
    console.error('Unified Search Fetch Error:', error);
    throw error;
  }
}
