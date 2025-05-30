
import React from 'react';
import  MarkdownRenderer  from './MarkdownRenderer';

interface QuoteResultsProps {
  results: any;
  onReset: () => void;
}

const QuoteResults: React.FC<QuoteResultsProps> = ({ results, onReset }) => {
  return (
    <div className="quote-results">
      <div className="results-header">
        <h2>Perfect quotes for your situation</h2>
        <p className="situation">"{results.situation}"</p>
        <p className="mood">Mood: {results.mood}</p>
      </div>

      <div className="recommendation">
        <MarkdownRenderer content={results.recommendation} />
      </div>

      <div className="all-quotes">
        <h3>All matching quotes we considered:</h3>
        <ul>
          {results.availableQuotes.map((quote: any, index: number) => (
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
      <button onClick={onReset} className="reset-button"> 
        Start Over
      </button>
    </div>
  );
};

export default QuoteResults;