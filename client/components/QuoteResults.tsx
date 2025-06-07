import React from 'react';
import MarkdownRenderer from './MarkdownRenderer';

interface MovieQuote {
  quote: string;
  actor: string;
  movie: string;
  year: number;
  score: string;
}

interface ApiResponse {
  success: boolean;
  recommendation: string;
  situation?: string;
  mood?: string;
  quotesFound: number;
  availableQuotes: MovieQuote[];
  cached?: boolean;
  cacheMatch?: {
    originalQuery: string;
    similarity: number;
    cachedAt: number;
    costSaved?: number; // ADDED: Cost saved information
  };
}

interface QuoteResultsProps {
  results: ApiResponse;
  onReset: () => void;
  searchMode: 'situation' | 'actor' | 'movie';
}

const QuoteResults: React.FC<QuoteResultsProps> = ({ results, onReset, searchMode }) => {
  // ADDED: Function to format cache timestamp
  const formatCacheDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  if (!results.success) {
    return (
      <div className="error-results">
        <p>No results found for your {searchMode} search.</p>
        <button onClick={onReset}>Try Again</button>
      </div>
    );
  }

  return (
    <div className="quote-results">
      {/* UPDATED: Enhanced cache notice with cost information */}
      {results.cached && results.cacheMatch && (
        <div className="cache-hit-info">
          <div className="cache-hit-header">
            ⚡ Cached Result
          </div>
          <div className="cache-hit-details">
            {results.cacheMatch.costSaved && (
              <span className="cost-saved">
                💰 Saved ${results.cacheMatch.costSaved.toFixed(6)}
              </span>
            )}
            <span className="similarity">
              🎯 {(results.cacheMatch.similarity * 100).toFixed(1)}% match
            </span>
            <span className="cached-time">
              🕐 Cached {formatCacheDate(results.cacheMatch.cachedAt)}
            </span>
          </div>
        </div>
      )}

      {/* FALLBACK: Keep your original cache notice for backwards compatibility */}
      {results.cached && !results.cacheMatch?.costSaved && (
        <div className="cache-notice">
          <p>✨ Smart match found from similar previous query ✨</p>
          {results.cacheMatch && (
            <p className="cache-details">
              Similar to: "{results.cacheMatch.originalQuery}" 
              ({(results.cacheMatch.similarity * 100).toFixed(0)}% match)
            </p>
          )}
        </div>
      )}

      <div className="results-header">
        <h2>
          {searchMode === 'situation' ? 'Perfect quotes for your situation' : 
           searchMode === 'actor' ? 'Quotes by this actor' : 
           'Quotes from this movie'}
        </h2>
        
        {searchMode === 'situation' && results.situation && (
          <>
            <p className="situation">"{results.situation}"</p>
            {results.mood && <p className="mood">Mood: {results.mood}</p>}
          </>
        )}
      </div>

      {results.recommendation && (
        <div className="recommendation">
          <MarkdownRenderer content={results.recommendation} />
        </div>
      )}

      {results.availableQuotes && results.availableQuotes.length > 0 && (
        <div className="all-quotes">
          <h3>{results.availableQuotes.length} matching quotes found:</h3>
          <ul>
            {results.availableQuotes.map((quote, index) => (
              <li key={index}>
                <blockquote>
                  "{quote.quote}"
                  <footer>
                    — {quote.actor} in <cite>{quote.movie}</cite> ({quote.year})
                    {quote.score && quote.score !== 'N/A' && quote.score !== '0.00' && (
                      <span className="score">Match score: {quote.score}</span>
                    )}
                  </footer>
                </blockquote>
              </li>
            ))}
          </ul>
        </div>
      )}

      <button onClick={onReset} className="reset-button">
        Start Over
      </button>
    </div>
  );
};

export default QuoteResults;