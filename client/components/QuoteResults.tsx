import React from 'react';
import MarkdownRenderer from './MarkdownRenderer';

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
}

interface QuoteResultsProps {
  results: ApiResponse;
  onReset: () => void;
}

const QuoteResults: React.FC<QuoteResultsProps> = ({ results, onReset }) => {
  if (!results.success) {
    return (
      <div className="error-results">
        <p>No results found for your situation.</p>
        <button onClick={onReset}>Try Again</button>
      </div>
    );
  }

  return (
    <div className="quote-results">
      {results.cached && (
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
        <h2>Perfect quotes for your situation</h2>
        <p className="situation">"{results.situation}"</p>
        <p className="mood">Mood: {results.mood}</p>
      </div>

      <div className="recommendation">
        <MarkdownRenderer content={results.recommendation} />
      </div>

      {results.availableQuotes && results.availableQuotes.length > 0 && (
        <div className="all-quotes">
          <h3>All matching quotes we considered:</h3>
          <ul>
            {results.availableQuotes.map((quote, index) => (
              <li key={index}>
                <blockquote>
                  "{quote.quote}"
                  <footer>
                    — {quote.character} in <cite>{quote.movie}</cite> ({quote.year})
                    <span className="score">Match score: {quote.score}</span>
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