import * as fs from "fs";
import * as path from "path";

export enum AlertSeverity {
    INFO = "INFO",
    WARNING = "WARNING",
    CRITICAL = "CRITICAL"
}

export interface AlertEvent {
    timestamp: string;
    oracleId?: string;
    market?: string;
    severity: AlertSeverity;
    message: string;
    digest?: string;
}

export interface AlertProvider {
    send(event: AlertEvent): Promise<void>;
}

export class ConsoleAlertProvider implements AlertProvider {
    async send(event: AlertEvent): Promise<void> {
        const color = event.severity === AlertSeverity.CRITICAL ? "\x1b[31m" : 
                      event.severity === AlertSeverity.WARNING ? "\x1b[33m" : "\x1b[32m";
        const reset = "\x1b[0m";
        console.log(`${color}[ALERT][${event.severity}] [${event.timestamp}] ${event.message}${event.oracleId ? ` (Oracle: ${event.oracleId})` : ""}${reset}`);
        
        // Log to file for persistence
        const logPath = path.join(process.cwd(), "logs", "alerts.log");
        if (!fs.existsSync(path.dirname(logPath))) fs.mkdirSync(path.dirname(logPath));
        fs.appendFileSync(logPath, JSON.stringify(event) + "\n");
    }
}

export class AlertSystem {
    private providers: AlertProvider[] = [];

    constructor(providers: AlertProvider[]) {
        this.providers = providers;
    }

    async notify(event: Omit<AlertEvent, "timestamp">): Promise<void> {
        const fullEvent: AlertEvent = {
            ...event,
            timestamp: new Date().toISOString()
        };
        await Promise.all(this.providers.map(p => p.send(fullEvent)));
    }
}
