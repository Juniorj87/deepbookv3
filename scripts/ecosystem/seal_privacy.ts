import { ecosystemJournal } from './protocol_journal.js';
import * as crypto from 'crypto';

export class SealPrivacyService {
    private commitments: Record<string, { hash: string, secret: string, data: any }> = {};

    /**
     * Commits to a prediction by encrypting/hashing it before settlement.
     */
    public async commit(predictionId: string, data: any): Promise<string> {
        ecosystemJournal.info('SEAL', 'Committing to prediction (Seal Encryption)', { predictionId });

        const secret = crypto.randomBytes(16).toString('hex');
        const hash = crypto.createHash('sha256').update(JSON.stringify(data) + secret).digest('hex');
        
        this.commitments[predictionId] = { hash, secret, data };
        
        ecosystemJournal.info('SEAL', 'Commitment generated', { hash });
        return hash;
    }

    /**
     * Reveals the prediction after settlement.
     */
    public async reveal(predictionId: string): Promise<any> {
        const commitment = this.commitments[predictionId];
        if (!commitment) throw new Error("Commitment not found");

        ecosystemJournal.info('SEAL', 'Revealing prediction secret', { predictionId, secret: commitment.secret });
        
        return commitment.data;
    }
}
