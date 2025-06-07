import React, { useState, useEffect } from 'react';
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
    costSaved?: number; // Cost saved from this specific cache hit
  };
  timestamp: string;
}

interface CacheStats {
  totalEntries: number;
  totalCachedQueries: number;
  potentialSavings: number;
  actualSavings: number; // Real money saved from cache usage
  cacheHitsCount: number;
  averageSavingsPerHit: number;
  efficiencyRatio: number;
  lastUpdated: string;
}

function App() {
  const [results, setResults] = useState<ApiResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchMode, setSearchMode] = useState<'situation' | 'actor' | 'movie'>('situation');
  
  // Cost tracking state
  const [sessionSavings, setSessionSavings] = useState<number>(0);
  const [totalActualSavings, setTotalActualSavings] = useState<number>(0); // UPDATED: Real savings
  const [cacheHitsCount, setCacheHitsCount] = useState<number>(0);
  const [showCostBanner, setShowCostBanner] = useState(false);

  // Load cache statistics on component mount
  useEffect(() => {
    fetchCacheStats();
  }, []);

  const fetchCacheStats = async () => {
    try {
      const response = await fetch('/api/cache-stats');
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.cacheStats) {
          // FIXED - Use actualSavings instead of potentialSavings
          setTotalActualSavings(data.cacheStats.actualSavings || 0);
          setCacheHitsCount(data.cacheStats.cacheHitsCount || 0);
        }
      }
    } catch (error) {
      console.log('Could not fetch cache stats:', error);
    }
  };

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
      
      // Added searchMode toggles
      if (searchMode === 'situation') {
        body = {
          naturalLanguageQuery: data.situation,
          mood: data.mood // FIXED - Use user's selected mood directly (no more mapping)
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
      
      // Track cache savings if this was a cached response
      if (result.cached && result.cacheMatch?.costSaved) {
        const costSaved = result.cacheMatch.costSaved;
        setSessionSavings(prev => prev + costSaved);
        setShowCostBanner(true);
        
        // Auto-hide banner after 3 seconds
        setTimeout(() => setShowCostBanner(false), 3000);
        
        // Refresh total stats to get updated actual savings
        setTimeout(() => fetchCacheStats(), 1000);
        
        console.log(`💰 Cache hit! Saved $${costSaved.toFixed(6)}`);
      }
      
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
        
        {/* Cost savings display */}
        {(sessionSavings > 0 || totalActualSavings > 0) && (
          <div className="cost-savings-container">
            {sessionSavings > 0 && (
              <div className="session-savings">
                💰 Session savings: ${sessionSavings.toFixed(4)}
              </div>
            )}
            {totalActualSavings > 0 && (
              <div className="total-savings">
                🏦 Total actual savings: ${totalActualSavings.toFixed(4)}
              </div>
            )}
            {cacheHitsCount > 0 && (
              <div className="cache-hits-count">
                ⚡ Cache hits: {cacheHitsCount}
              </div>
            )}
          </div>
        )}
        
        {/* Cache hit banner */}
        {showCostBanner && (
          <div className="cache-hit-banner">
            ⚡ Cached result - saved real money on AI costs!
          </div>
        )}
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
        {/* Show actual savings */}
        {totalActualSavings > 0 && (
          <p className="cache-footer">
            Smart caching has saved ${totalActualSavings.toFixed(4)} in actual AI costs
          </p>
        )}
        {cacheHitsCount > 0 && totalActualSavings > 0 && (
          <p className="cache-footer-details">
            {cacheHitsCount} cache hits • ${(totalActualSavings / cacheHitsCount).toFixed(4)} avg per hit
          </p>
        )}
      </footer>
    </div>
  );
}

export default App;