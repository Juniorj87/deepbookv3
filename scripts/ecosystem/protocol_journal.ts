import fs from 'fs';
import path from 'path';

export interface JournalEntry {
    timestamp: string;
    level: 'INFO' | 'WARN' | 'ERROR' | 'ANALYTICS' | 'PREDICTION' | 'AI';
    module: string;
    action: string;
    data?: any;
}

export class ProtocolJournal {
    private logPath: string;

    constructor(filename: string = 'protocol_ecosystem.jsonl') {
        this.logPath = path.join(process.cwd(), filename);
    }

    public async log(level: JournalEntry['level'], module: string, action: string, data?: any) {
        const entry: JournalEntry = {
            timestamp: new Date().toISOString(),
            level,
            module,
            action,
            data
        };
        const line = JSON.stringify(entry) + '\n';
        await fs.promises.appendFile(this.logPath, line);
        
        // Console output with colors
        const colors: Record<string, string> = {
            'ERROR': '\x1b[31m',
            'WARN': '\x1b[33m',
            'INFO': '\x1b[32m',
            'ANALYTICS': '\x1b[36m',
            'PREDICTION': '\x1b[35m',
            'AI': '\x1b[34m'
        };
        const color = colors[level] || '\x1b[0m';
        console.log(`${color}[${entry.timestamp}] [${module}] ${action}\x1b[0m`, data ? JSON.stringify(data) : '');
    }

    public info(module: string, action: string, data?: any) { return this.log('INFO', module, action, data); }
    public warn(module: string, action: string, data?: any) { return this.log('WARN', module, action, data); }
    public error(module: string, action: string, data?: any) { return this.log('ERROR', module, action, data); }
    public analytics(module: string, action: string, data?: any) { return this.log('ANALYTICS', module, action, data); }
    public prediction(module: string, action: string, data?: any) { return this.log('PREDICTION', module, action, data); }
    public ai(module: string, action: string, data?: any) { return this.log('AI', module, action, data); }
}

export const ecosystemJournal = new ProtocolJournal();
