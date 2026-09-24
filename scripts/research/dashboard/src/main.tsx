import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createNetworkConfig, SuiClientProvider, WalletProvider } from '@mysten/dapp-kit';
import '@mysten/dapp-kit/dist/index.css';
import App from './App';
import Dashboard from './pages/Dashboard';
import Research from './pages/Research';
import Oracles from './pages/Oracles';
import Metrics from './pages/Metrics';
import History from './pages/History';
import Trade from './pages/Trade';
import './index.css';

const queryClient = new QueryClient();
const { networkConfig } = createNetworkConfig({
  testnet: { url: 'https://fullnode.testnet.sui.io:443', network: 'testnet' },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networkConfig} defaultNetwork="testnet">
        <WalletProvider autoConnect>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<App />}>
                <Route index element={<Dashboard />} />
                <Route path="trade" element={<Trade />} />
                <Route path="research" element={<Research />} />
                <Route path="oracles" element={<Oracles />} />
                <Route path="metrics" element={<Metrics />} />
                <Route path="history" element={<History />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
