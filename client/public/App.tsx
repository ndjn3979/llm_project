import React, { useState} from 'react';
import './App.css';
import QuoteForm from '../components/QuoteForm';
import QuoteResults from '../components/QuoteResults';

function App() {
  const [results, setResults] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (situation: string, mood: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
        // need recommendation from api
      //const response = await  (situation, mood);
      //setResults(response);
    } catch (err) {
      setError('Failed to get quote recommendations. Please try again.');
      console.error(err);
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
          <QuoteForm onSubmit={handleSubmit} isLoading={isLoading} />
        ) : (
          <QuoteResults 
            results={results} 
            onReset={handleReset} 
          />
        )}

        {error && <div className="error-message">{error}</div>}
      </main>

      <footer className="app-footer">
        <p>Powered by AI and a love for cinema</p>
      </footer>
    </div>
  );
}

export default App;