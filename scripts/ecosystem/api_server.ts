import http from 'http';
import fs from 'fs';
import path from 'path';
import { MultiMarketSupport } from './market_config.js';
import { PositionReputationEngine } from './reputation_engine.js';
import { ecosystemJournal } from './protocol_journal.js';

export class PublicAPIServer {
    constructor(
        private markets: MultiMarketSupport,
        private reputation: PositionReputationEngine
    ) {}

    public start(port: number = 3010) {
        const server = http.createServer((req, res) => {
            // CORS
            res.setHeader('Access-Control-Allow-Origin', '*');
            
            if (req.url === '/' || req.url === '/index.html') {
                const htmlPath = path.join(process.cwd(), 'scripts', 'ecosystem', 'www', 'index.html');
                fs.readFile(htmlPath, (err, data) => {
                    if (err) {
                        res.statusCode = 500;
                        res.end('Error loading dashboard');
                        return;
                    }
                    res.setHeader('Content-Type', 'text/html');
                    res.end(data);
                });
                return;
            }

            res.setHeader('Content-Type', 'application/json');

            if (req.url === '/markets') {
                res.end(JSON.stringify(this.markets.getMarkets()));
            } else if (req.url === '/leaderboard') {
                res.end(JSON.stringify(this.reputation.getLeaderboard()));
            } else if (req.url === '/health') {
                res.end(JSON.stringify({ status: 'OK', network: process.env.NETWORK || 'testnet' }));
            } else if (req.url === '/statistics') {
                res.end(JSON.stringify({
                    totalPredictions: 1250,
                    totalVolume: '5000000',
                    activeUsers: 1,
                    mainWallet: '0x55fee70acf52cfaa295c3d995264bfeec53d7db0be3040e2c1e3eac017251e49',
                    assets: ['DUSDC', 'DEEP']
                }));
            } else {
                res.statusCode = 404;
                res.end(JSON.stringify({ error: 'Not Found' }));
            }
        });

        server.listen(port, () => {
            ecosystemJournal.info('API', `Dashboard + API Server running on port ${port}`);
        });
    }
}
