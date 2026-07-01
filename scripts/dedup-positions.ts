import fs from "fs";

const PATH = "positions_state.json";
const data = JSON.parse(fs.readFileSync(PATH, "utf8"));

console.log(`Before: ${data.length} positions`);

// Keep latest entry per positionId
const seen = new Map<string, any>();
for (const pos of data) {
  const existing = seen.get(pos.positionId);
  if (!existing || new Date(pos.createdAt) > new Date(existing.createdAt)) {
    seen.set(pos.positionId, pos);
  }
}

const deduped = [...seen.values()];
console.log(`After:  ${deduped.length} positions (removed ${data.length - deduped.length} duplicates)`);

// Stats
const stats: Record<string, number> = {};
for (const p of deduped) {
  stats[p.state] = (stats[p.state] || 0) + 1;
}
console.log("States:", stats);

const winners = (stats.CLAIMABLE || 0) + (stats.CLAIMED || 0) + (stats.FAILED || 0);
const total = deduped.length;
console.log(`Win rate: ${((winners / total) * 100).toFixed(1)}% (${winners}/${total})`);

fs.writeFileSync(PATH, JSON.stringify(deduped, null, 2));
console.log("Saved deduplicated positions_state.json");
