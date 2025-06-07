import React, { useState, useEffect } from 'react';

interface QuoteFormProps {
  onSubmit: (data: {
    situation?: string;
    mood?: string;
    actor?: string;
    movie?: string;
  }) => void;
  isLoading: boolean;
  error?: string;
  searchMode: 'situation' | 'actor' | 'movie';
}

const moodOptions = [
  { value: 'funny', label: 'Funny' },
  { value: 'cool', label: 'Cool/Badass' },
  { value: 'dramatic', label: 'Dramatic' },
  { value: 'sassy', label: 'Sassy/Witty' },
  { value: 'inspirational', label: 'Inspirational' },
  { value: 'romantic', label: 'Romantic' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'serious', label: 'Serious' }
];

const QuoteForm: React.FC<QuoteFormProps> = ({ onSubmit, isLoading, error, searchMode }) => {
  const [situation, setSituation] = useState('');
  const [mood, setMood] = useState('funny');
  const [actor, setActor] = useState('');
  const [movie, setMovie] = useState('');

  // Reset form fields when search mode changes
  useEffect(() => {
    setSituation('');
    setMood('funny');
    setActor('');
    setMovie('');
  }, [searchMode]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (searchMode === 'situation' && situation.trim()) {
      onSubmit({ situation, mood });
    } else if (searchMode === 'actor' && actor.trim()) {
      onSubmit({ actor });
    } else if (searchMode === 'movie' && movie.trim()) {
      onSubmit({ movie });
    }
  };

  return (
    <div className="quote-form-container">
      {error && <div className="error-message">{error}</div>}
      
      <form className="quote-form" onSubmit={handleSubmit}>
        {searchMode === 'situation' && (
          <>
            <div className="form-group">
              <label htmlFor="situation">Describe your situation:</label>
              <textarea
                id="situation"
                value={situation}
                onChange={(e) => setSituation(e.target.value)}
                placeholder="E.g., My friend just roasted me and I need a perfect comeback"
                required
                rows={4}
                disabled={isLoading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="mood">Preferred mood:</label>
              <select
                id="mood"
                value={mood}
                onChange={(e) => setMood(e.target.value)}
                disabled={isLoading}
              >
                {moodOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        {searchMode === 'actor' && (
          <div className="form-group">
            <label htmlFor="actor">Actor Name:</label>
            <input
              id="actor"
              type="text"
              value={actor}
              onChange={(e) => setActor(e.target.value)}
              placeholder="E.g., Tom Hanks, Tom Cruise"
              required
              disabled={isLoading}
            />
          </div>
        )}

        {searchMode === 'movie' && (
          <div className="form-group">
            <label htmlFor="movie">Movie Title:</label>
            <input
              id="movie"
              type="text"
              value={movie}
              onChange={(e) => setMovie(e.target.value)}
              placeholder="E.g., The Godfather, Titanic"
              required
              disabled={isLoading}
            />
          </div>
        )}

        <button 
          type="submit" 
          disabled={isLoading || 
            (searchMode === 'situation' && !situation.trim()) ||
            (searchMode === 'actor' && !actor.trim()) ||
            (searchMode === 'movie' && !movie.trim())
          }
          className={isLoading ? 'loading' : ''}
        >
          {isLoading ? (
            <>
              <span className="spinner"></span>
              {searchMode === 'situation' ? 'Finding perfect quotes...' : 'Searching quotes...'}
            </>
          ) : (
            searchMode === 'situation' ? 'Get Movie Quotes' : 'Find Quotes'
          )}
        </button>
      </form>
    </div>
  );
};

export default QuoteForm;