import fs from 'fs';
import path from 'path';
import { ecosystemJournal } from './protocol_journal.js';

export interface UserReputation {
    address: string;
    score: number;
    totalPredictions: number;
    correctPredictions: number;
    totalRoi: number;
}

export class PositionReputationEngine {
    private dbPath: string;
    private reputations: Record<string, UserReputation> = {};

    constructor(filename: string = 'reputation_db.json') {
        this.dbPath = path.join(process.cwd(), filename);
        this.load();
    }

    private load() {
        if (fs.existsSync(this.dbPath)) {
            this.reputations = JSON.parse(fs.readFileSync(this.dbPath, 'utf8'));
        }
    }

    private save() {
        fs.writeFileSync(this.dbPath, JSON.stringify(this.reputations, null, 2));
    }

    public updateReputation(address: string, isCorrect: boolean, roi: number) {
        if (!this.reputations[address]) {
            this.reputations[address] = {
                address,
                score: 50, // Base score
                totalPredictions: 0,
                correctPredictions: 0,
                totalRoi: 0
            };
        }

        const rep = this.reputations[address];
        rep.totalPredictions++;
        if (isCorrect) rep.correctPredictions++;
        rep.totalRoi += roi;
        
        // Calculate new score (0-100)
        const accuracy = rep.correctPredictions / rep.totalPredictions;
        rep.score = Math.min(100, Math.max(0, accuracy * 80 + (rep.totalRoi > 0 ? 20 : 0)));

        this.save();
        ecosystemJournal.info('REPUTATION', 'Reputation updated', { address, score: rep.score });
    }

    public getReputation(address: string): UserReputation | undefined {
        return this.reputations[address];
    }

    public getLeaderboard(): UserReputation[] {
        return Object.values(this.reputations).sort((a, b) => b.score - a.score);
    }
}
