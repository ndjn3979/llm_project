
import React, { useState } from 'react';

interface QuoteFormProps {
    // function that takes situation and mood strings
  onSubmit: (situation: string, mood: string) => void;
  isLoading: boolean;
  error?: string;
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
const QuoteForm: React.FC<QuoteFormProps> = ({ onSubmit, isLoading, error }) => {
  const [situation, setSituation] = useState(''); // for user's input
  const [mood, setMood] = useState('funny'); 

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // check if it is not empty
    if (situation.trim()) {
      onSubmit(situation, mood);
    }
  };

  return (
    <div className="quote-form-container">
      {error && <div className="error-message">{error}</div>}
      
      <form className="quote-form" onSubmit={handleSubmit}>
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

        <button 
          type="submit" 
          disabled={isLoading || !situation.trim()}
          className={isLoading ? 'loading' : ''}
        >
          {isLoading ? (
            <>
              <span className="spinner"></span>
              Finding perfect quotes...
            </>
          ) : (
            'Get Movie Quotes'
          )}
        </button>
      </form>
    </div>
  );
};

export default QuoteForm;