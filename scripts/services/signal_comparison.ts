/**
 * Signal v2 vs v3 Live Comparison
 * 
 * Run alongside production feed to compare signals in real-time.
 * Logs differences but does NOT execute trades — safe for testing.
 * 
 * Usage: npx tsx services/signal_comparison.ts
 */

import { config } from "dotenv";
config({ override: true });
import { generateSignal as generateSignalV2, fetchMarketData, fetchFundingRate, SignalResult } from "./signal_engine.ts";
import { generateSignal as generateSignalV3 } from "./signal_engine_v2.ts";
import * as fs from "fs";

const ASSETS = ["BTC", "ETH", "DEEP"];
const COMPARE_LOG = path.resolve(__dirname, "../../logs/signal_comparison.log");

import * as path from "path";

function logComparison(data: any) {
  const line = JSON.stringify(data) + "\n";
  fs.appendFileSync(COMPARE_LOG, line);
}

async function runComparison() {
  console.log("=== Signal v2 vs v3 Live Comparison ===");
  console.log("Running every 60 seconds. Press Ctrl+C to stop.\n");
  
  // Ensure log directory exists
  const logDir = path.dirname(COMPARE_LOG);
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

  let cycle = 0;
  
  while (true) {
    cycle++;
    console.log(`\n--- Cycle ${cycle} [${new Date().toISOString()}] ---`);
    
    // Fetch BTC data first (for correlation)
    let btcData;
    try {
      btcData = await fetchMarketData("BTC");
    } catch (e) {
      console.error("[ERROR] Cannot fetch BTC data");
      await sleep(60000);
      continue;
    }

    for (const asset of ASSETS) {
      try {
        const data = await fetchMarketData(asset);
        const funding = await fetchFundingRate(asset);
        
        // v2 signal
        const v2 = generateSignalV2(data, 0.605, 1.0, 1.0);
        
        // v3 signal
        const v3 = generateSignalV3(data, 0.605, 1.0, 1.0, funding, btcData.closes);

        const directionMatch = v2.direction === v3.direction;
        const scoreDiff = Math.abs(v2.score - v3.score);
        const confidenceDiff = Math.abs(v2.confidence - v3.confidence);

        // Log to file
        logComparison({
          timestamp: Date.now(),
          asset,
          v2: { direction: v2.direction, score: v2.score, confidence: v2.confidence },
          v3: { direction: v3.direction, score: v3.score, confidence: v3.confidence, funding: v3.components.funding, btcCorr: v3.components.btcCorrelation },
          directionMatch,
          scoreDiff,
          confidenceDiff
        });

        // Console output
        const match = directionMatch ? "✓" : "✗";
        console.log(`[${asset}] ${match} v2=${v2.direction}(${v2.score.toFixed(3)}) v3=${v3.direction}(${v3.score.toFixed(3)}) funding=${(funding*100).toFixed(3)}% btcCorr=${v3.components.btcCorrelation.toFixed(2)}`);
        
      } catch (e: any) {
        console.error(`[${asset}] ERROR: ${e.message}`);
      }
    }
    
    await sleep(60000);
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

runComparison().catch(console.error);
