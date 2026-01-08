/**
 * API client for jo-sem-search backend
 */

// Types matching the backend API
export interface SearchRequest {
  query: string;
  category?: string;
  mood?: string;
  complexity?: string;
  cost?: string;
  ingredients_query?: string;
  top_k?: number;
  similarity_threshold?: number;
  include_full_recipe?: boolean;
  include_chunks?: boolean;
}

export interface RecipeMatchResponse {
  recipe_id: string;
  title: string;
  similarity_score: number;
  combined_score: number;
  category?: string | null;
  mood?: string | null;
  complexity?: string | null;
  cost?: string | null;
  file_path: string;
  match_explanation: string;
  matching_chunks: Array<Record<string, unknown>>;
  full_recipe?: Record<string, unknown> | null;
}

export interface SearchResponse {
  query: string;
  filters_applied: Record<string, unknown>;
  results: RecipeMatchResponse[];
  total: number;
  took_ms: number;
}

export interface SearchOptions {
  category?: string;
  mood?: string;
  complexity?: string;
  cost?: string;
  ingredients_query?: string;
  top_k?: number;
  similarity_threshold?: number;
  include_full_recipe?: boolean;
  include_chunks?: boolean;
}

// Get API base URL from environment variable or use default
// @ts-expect-error - Vite provides import.meta.env but TypeScript types may not be fully loaded
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

/**
 * Search recipes using semantic search
 */
export async function searchRecipes(
  query: string,
  options: SearchOptions = {}
): Promise<SearchResponse> {
  const requestBody: SearchRequest = {
    query,
    top_k: options.top_k ?? 10,
    similarity_threshold: options.similarity_threshold ?? 0.3,
    include_full_recipe: options.include_full_recipe ?? true,
    include_chunks: options.include_chunks ?? false,
    ...(options.category && { category: options.category }),
    ...(options.mood && { mood: options.mood }),
    ...(options.complexity && { complexity: options.complexity }),
    ...(options.cost && { cost: options.cost }),
    ...(options.ingredients_query && { ingredients_query: options.ingredients_query }),
  };

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/recipes/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed: ${response.status} ${response.statusText}. ${errorText}`);
    }

    const data: SearchResponse = await response.json();
    return data;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Failed to connect to the search API. Please make sure the backend is running.');
    }
    throw error;
  }
}
