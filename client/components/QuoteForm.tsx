
import React, { useState } from 'react';

interface QuoteFormProps {
    // function that takes situation and mood strings
  onSubmit: (situation: string, mood: string) => void;
  isLoading: boolean;
}

const QuoteForm: React.FC<QuoteFormProps> = ({ onSubmit, isLoading }) => {
  const [situation, setSituation] = useState(''); // for user's input
  const [mood, setMood] = useState('neutral'); // for selected mood

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // check if it is not empty
    if (situation.trim()) {
      onSubmit(situation, mood);
    }
  };

  return (
    <form className="quote-form" onSubmit={handleSubmit}>
      <div className="form-group">
        <label htmlFor="situation">Describe your situation:</label>
        <textarea
          id="situation"
          value={situation}
          onChange={(e) => setSituation(e.target.value)}
          placeholder="E.g. My friend just won lottery "
          required
          rows={4}
        />
      </div>

      <div className="form-group">
        <label htmlFor="mood">Preferred mood:</label>
        <select
          id="mood"
          value={mood}
          onChange={(e) => setMood(e.target.value)}
        >
          <option value="funny">Funny</option>
          <option value="inspirational">Inspirational</option>
          <option value="neutral">Neutral</option>
          <option value="serious">Serious</option>
          <option value="romantic">Romantic</option>
          <option value="dramatic">Dramatic</option>
        </select>
      </div>

      <button type="submit" disabled={isLoading || !situation.trim()}>
        {isLoading ? 'Finding perfect quotes...' : 'Get Movie Quotes'}
      </button>
    </form>
  );
};

export default QuoteForm;