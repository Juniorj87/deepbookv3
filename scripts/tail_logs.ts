import * as fs from 'fs';

function tailFile(filename: string, linesCount: number = 100): string {
  try {
    if (!fs.existsSync(filename)) {
      return `${filename} does not exist\n`;
    }
    const buffer = fs.readFileSync(filename);
    const content = buffer.toString('utf8');
    const lines = content.split('\n');
    const tailLines = lines.slice(-linesCount);
    return `=== LAST ${linesCount} LINES OF ${filename} ===\n${tailLines.join('\n')}\n`;
  } catch (err: any) {
    return `Error reading ${filename}: ${err.message}\n`;
  }
}

const errTail = tailFile('logs/oracle-feed.err.log', 100);
const outTail = tailFile('logs/oracle-feed.out.log', 100);
const serverErrTail = tailFile('logs/dashboard-server.err.log', 50);
const serverOutTail = tailFile('logs/dashboard-server.out.log', 50);

fs.writeFileSync('logs_tail.txt', errTail + '\n' + outTail + '\n' + serverErrTail + '\n' + serverOutTail);
console.log('Done!');
