// Server error interface
export interface ServerError {
  log: string;
  status: number;
  message: {
    err: string;
  };
}

// Movie quote interface
export interface MovieQuote {
  quote: string;
  actor: string;
  movie: string;
  year: number;
  situations: string[];
  mood: string;
}

// Search result interface
export interface QuoteSearchResult {
  quote: MovieQuote;
  score: number;
}

// Query context interface
export interface QueryContext {
  situationTypes: string[];
  mood: 'funny' | 'cool' | 'dramatic' | 'sassy';
  originalQuery: string;
}

// API response interface
export interface ApiResponse {
  success: boolean;
  recommendation: string;
  situation: string;
  mood: string;
  quotesFound: number;
  availableQuotes: {
    quote: string;
    actor: string;
    movie: string;
    year: number;
    score: string;
  }[];
  cached?: boolean;
  cacheMatch?: {
    originalQuery: string;
    similarity: number;
    cachedAt: number;
  };
  timestamp: string;
}