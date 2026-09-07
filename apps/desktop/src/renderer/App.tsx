import React, { useEffect, useState } from 'react';

const App: React.FC = () => {
  const [apiStatus, setApiStatus] = useState<string>('Verifying...');

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:10000';
        const response = await fetch(`${apiUrl}/health`);
        const data = await response.json();
        setApiStatus(`Connected (${new Date(data.timestamp).toLocaleString()})`);
      } catch (error) {
        setApiStatus('Failed to connect to API');
        console.error(error);
      }
    };
    
    fetchHealth();
  }, []);

  return (
    <div style={{ padding: '2rem', textAlign: 'center', width: '100%' }}>
      <h1 style={{ color: 'var(--accent)' }}>Relay Desktop</h1>
      <p style={{ color: 'var(--text)' }}>API Status: <strong style={{ color: apiStatus.includes('Connected') ? 'var(--success)' : 'var(--danger)' }}>{apiStatus}</strong></p>
    </div>
  );
};

export default App;
