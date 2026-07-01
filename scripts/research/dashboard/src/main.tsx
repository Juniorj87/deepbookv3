import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import App from './App';
import Dashboard from './pages/Dashboard';
import Research from './pages/Research';
import Oracles from './pages/Oracles';
import Metrics from './pages/Metrics';
import History from './pages/History';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<Dashboard />} />
          <Route path="research" element={<Research />} />
          <Route path="oracles" element={<Oracles />} />
          <Route path="metrics" element={<Metrics />} />
          <Route path="history" element={<History />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
