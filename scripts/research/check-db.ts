import Database from 'better-sqlite3';
const db = new Database('scripts/research/research.db');
const total = db.prepare('SELECT COUNT(*) as c FROM predictions').get() as any;
console.log('Total:', total.c);
const dirs = db.prepare('SELECT direction, COUNT(*) as cnt FROM predictions GROUP BY direction').all();
console.log('Directions:', dirs);
const sample = db.prepare("SELECT id, market, direction, strike FROM predictions WHERE direction != 'UP' LIMIT 5").all();
console.log('Non-UP sample:', sample);
db.close();
