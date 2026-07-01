/**
 * Signal Engine v3 Test — Compare v2 vs v3
 * 
 * Runs both engines on same data and logs differences.
 * No changes to production code — safe to run.
 */

import { generateSignal as generateSignalV2, fetchMarketData, fetchFundingRate } from "./signal_engine.ts";
import { generateSignal as generateSignalV3 } from "./signal_engine_v2.ts";

const ASSETS = ["BTC", "ETH", "DEEP"];

async function runTest() {
  console.log("=== Signal Engine v2 vs v3 Test ===\n");
  
  // Fetch BTC data first (needed for correlation)
  let btcData;
  try {
    btcData = await fetchMarketData("BTC");
    console.log(`[DATA] BTC: ${btcData.closes.length} candles, last price: $${btcData.closes[btcData.closes.length - 1].toFixed(2)}`);
  } catch (e) {
    console.error("[ERROR] Cannot fetch BTC data:", e);
    return;
  }

  const results: any[] = [];

  for (const asset of ASSETS) {
    console.log(`\n--- ${asset} ---`);
    
    try {
      const data = await fetchMarketData(asset);
      const funding = await fetchFundingRate(asset);
      
      console.log(`[DATA] ${asset}: ${data.closes.length} candles, last price: $${data.closes[data.closes.length - 1].toFixed(4)}`);
      console.log(`[FUNDING] ${asset}: ${(funding * 100).toFixed(4)}%`);

      // v2 signal (current)
      const v2 = generateSignalV2(data, 0.605, 1.0, 1.0);
      
      // v3 signal (new)
      const v3 = generateSignalV3(data, 0.605, 1.0, 1.0, funding, btcData.closes);

      console.log(`\n[v2] Direction: ${v2.direction} | Score: ${v2.score.toFixed(4)} | Confidence: ${v2.confidence.toFixed(2)} | RSI: ${v2.components.rsi.toFixed(1)} | Mom: ${(v2.components.momentum * 100).toFixed(2)}%`);
      console.log(`[v3] Direction: ${v3.direction} | Score: ${v3.score.toFixed(4)} | Confidence: ${v3.confidence.toFixed(2)} | RSI: ${v3.components.rsi.toFixed(1)} | Mom: ${(v3.components.momentum * 100).toFixed(2)}%`);
      console.log(`[v3] Funding: ${v3.components.funding.toFixed(3)} | BTC Corr: ${v3.components.btcCorrelation.toFixed(3)}`);

      // Compare
      const directionMatch = v2.direction === v3.direction;
      const scoreDiff = Math.abs(v2.score - v3.score);
      const confidenceDiff = Math.abs(v2.confidence - v3.confidence);

      console.log(`[DIFF] Direction match: ${directionMatch ? "YES" : "NO"} | Score diff: ${scoreDiff.toFixed(4)} | Confidence diff: ${confidenceDiff.toFixed(4)}`);

      results.push({
        asset,
        v2: { direction: v2.direction, score: v2.score, confidence: v2.confidence },
        v3: { direction: v3.direction, score: v3.score, confidence: v3.confidence, funding: v3.components.funding, btcCorr: v3.components.btcCorrelation },
        directionMatch,
        scoreDiff,
        confidenceDiff
      });
    } catch (e) {
      console.error(`[ERROR] ${asset}:`, e);
    }
  }

  // Summary
  console.log("\n=== Summary ===");
  const matches = results.filter(r => r.directionMatch).length;
  const total = results.length;
  console.log(`Direction agreement: ${matches}/${total} (${(matches/total*100).toFixed(0)}%)`);
  
  const avgScoreDiff = results.reduce((a, r) => a + r.scoreDiff, 0) / total;
  console.log(`Average score difference: ${avgScoreDiff.toFixed(4)}`);
  
  // Log for analysis
  console.log("\n=== v3 Enhancements ===");
  console.log("1. Funding rate integrated (negative = bullish)");
  console.log("2. BTC correlation applied (BTC trend * correlation)");
  console.log("3. Adaptive threshold (higher in volatile markets)");
  console.log("4. Component weights rebalanced");
}

runTest().catch(console.error);
