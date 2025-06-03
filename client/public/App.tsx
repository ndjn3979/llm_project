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

  const handleSubmit = async (situation: string, mood: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/movie-quotes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          naturalLanguageQuery: situation,
          mood: mood === 'inspirational' ? 'dramatic' : 
                mood === 'romantic' ? 'dramatic' : 
                mood === 'neutral' ? 'cool' : 
                mood === 'serious' ? 'dramatic' : mood
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message?.err || 'Failed to fetch quotes');
      }

      const data: ApiResponse = await response.json();
      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get quote recommendations');
      console.error('API Error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setResults(null);
    setError(null);
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Movie Quote Recommendation</h1>
        <p>Find the perfect movie quote for any situation</p>
      </header>

      <main className="app-main">
        {!results ? (
          <QuoteForm 
            onSubmit={handleSubmit} 
            isLoading={isLoading} 
            error={error || undefined} 
          />
        ) : (
          <QuoteResults 
            results={results} 
            onReset={handleReset} 
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