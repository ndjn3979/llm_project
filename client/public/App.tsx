import React, { useState } from 'react';
import './App.css';
import QuoteForm from '../components/QuoteForm';
import QuoteResults from '../components/QuoteResults';

interface MovieQuote {
  quote: string;
  character: string;
  movie: string;
  year: number;
  score: string;
}

interface ApiResponse {
  success: boolean;
  recommendation: string;
  situation: string;
  mood: string;
  quotesFound: number;
  availableQuotes: MovieQuote[];
  cached?: boolean;
  cacheMatch?: {
    originalQuery: string;
    similarity: number;
    cachedAt: number;
  };
  timestamp: string;
}

function App() {
  const [results, setResults] = useState<ApiResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchMode, setSearchMode] = useState<'situation' | 'actor' | 'movie'>('situation');

  const handleSubmit = async (data: {
    situation?: string;
    mood?: string;
    actor?: string;
    movie?: string;
  }) => {
    setIsLoading(true);
    setError(null);
    
    try {
      let body: any = {};
      let endpoint = '/api/movie-quotes';
      
      if (searchMode === 'situation') {
        body = {
          naturalLanguageQuery: data.situation,
          mood: data.mood === 'inspirational' ? 'dramatic' : 
                data.mood === 'romantic' ? 'dramatic' : 
                data.mood === 'neutral' ? 'cool' : 
                data.mood === 'serious' ? 'dramatic' : data.mood
        };
      } else if (searchMode === 'actor') {
        endpoint = '/api/search-by-actor';
        body = { actorName: data.actor };
      } else if (searchMode === 'movie') {
        endpoint = '/api/search-by-movie';
        body = { movieTitle: data.movie };
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message?.err || 'Failed to fetch quotes');
      }

      const result: ApiResponse = await response.json();
      setResults(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get quotes');
      console.error('API Error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setResults(null);
    setError(null);
  };

  const handleSearchModeChange = (mode: 'situation' | 'actor' | 'movie') => {
    setSearchMode(mode);
    setResults(null); // Clear results when changing search mode
    setError(null); // Clear any errors
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>CineQuote</h1>
        <p>Find the perfect movie quote for any situation or by actor/movie</p>
      </header>

      <div className="search-mode-toggle">
        <button
          className={searchMode === 'situation' ? 'active' : ''}
          onClick={() => handleSearchModeChange('situation')}
        >
          Search by Situation
        </button>
        <button
          className={searchMode === 'actor' ? 'active' : ''}
          onClick={() => handleSearchModeChange('actor')}
        >
          Search by Actor
        </button>
        <button
          className={searchMode === 'movie' ? 'active' : ''}
          onClick={() => handleSearchModeChange('movie')}
        >
          Search by Movie
        </button>
      </div>

      <main className="app-main">
        {!results ? (
          <QuoteForm 
            onSubmit={handleSubmit} 
            isLoading={isLoading} 
            error={error || undefined}
            searchMode={searchMode}
          />
        ) : (
          <QuoteResults 
            results={results} 
            onReset={handleReset} 
            searchMode={searchMode}
          />
        )}
      </main>

      <footer className="app-footer">
        <p>Powered by AI and a love for cinema</p>
      </footer>
    </div>
  );
}

export default App;