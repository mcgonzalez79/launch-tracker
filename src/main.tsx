import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css'; // <- add this line

const el = document.getElementById('root');
if (el) {
  const RootApp = App as React.FC;
  createRoot(el).render(
    <React.StrictMode>
      <RootApp />
    </React.StrictMode>
  );
}
