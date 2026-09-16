/**
 * XGBoost Safety Model — Performance Metrics Calculator
 * Regenerates training data with the same seed, re-evaluates the saved model,
 * and prints classification + regression metrics for resume / presentation.
 */

import * as fs from "fs";
import * as path from "path";

// Seeded PRNG (same seed as training)
function mulberry32(a: number) {
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rng = mulberry32(42);
function gauss(m: number, s: number) { const u1 = rng(), u2 = rng(); return m + Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2) * s; }
function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
function rnd2(v: number) { return Math.round(v * 100) / 100; }
function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface ZoneSeed { name:string; lat:number; lon:number; radius:number; areaType:string; crimeW:number; light:number; policePx:number; winePx:number; cctv:number; traffic:number; nightRisk:number; }

const ZONES: ZoneSeed[] = [
  { name:"GB Road", lat:28.6505, lon:77.2230, radius:0.6, areaType:"mixed", crimeW:8.5, light:3.0, policePx:4.0, winePx:8.5, cctv:2.0, traffic:6.0, nightRisk:0.85 },
  { name:"Seelampur", lat:28.6840, lon:77.2680, radius:1.5, areaType:"slum", crimeW:8.8, light:2.5, policePx:2.5, winePx:7.0, cctv:1.5, traffic:5.0, nightRisk:0.9 },
  { name:"Jahangirpuri", lat:28.7290, lon:77.1720, radius:1.8, areaType:"slum", crimeW:9.0, light:2.0, policePx:2.5, winePx:7.5, cctv:1.5, traffic:4.0, nightRisk:0.92 },
  { name:"Nand Nagri", lat:28.6960, lon:77.3110, radius:1.2, areaType:"slum", crimeW:8.2, light:3.0, policePx:3.0, winePx:6.5, cctv:2.0, traffic:5.0, nightRisk:0.82 },
  { name:"Seemapuri", lat:28.6870, lon:77.3200, radius:1.0, areaType:"mixed", crimeW:7.8, light:3.5, policePx:3.5, winePx:6.0, cctv:2.5, traffic:5.5, nightRisk:0.78 },
  { name:"Mangolpuri", lat:28.7080, lon:77.1200, radius:1.5, areaType:"residential", crimeW:7.5, light:3.5, policePx:3.5, winePx:5.5, cctv:2.5, traffic:5.0, nightRisk:0.75 },
  { name:"Sangam Vihar", lat:28.5030, lon:77.2330, radius:2.0, areaType:"slum", crimeW:8.0, light:2.5, policePx:2.0, winePx:7.0, cctv:1.0, traffic:4.5, nightRisk:0.88 },
  { name:"Connaught Place", lat:28.6315, lon:77.2167, radius:1.5, areaType:"commercial", crimeW:4.0, light:9.0, policePx:8.5, winePx:5.0, cctv:9.0, traffic:9.0, nightRisk:0.35 },
  { name:"India Gate", lat:28.6129, lon:77.2295, radius:1.0, areaType:"govt", crimeW:2.5, light:9.5, policePx:9.5, winePx:1.5, cctv:9.5, traffic:8.0, nightRisk:0.2 },
  { name:"Parliament", lat:28.6175, lon:77.2085, radius:0.8, areaType:"govt", crimeW:1.5, light:9.5, policePx:9.5, winePx:0.5, cctv:10, traffic:7.0, nightRisk:0.15 },
  { name:"Lutyens Zone", lat:28.5980, lon:77.2000, radius:2.5, areaType:"govt", crimeW:2.0, light:9.0, policePx:9.0, winePx:1.0, cctv:9.0, traffic:7.5, nightRisk:0.2 },
  { name:"Vasant Vihar", lat:28.5570, lon:77.1580, radius:2.0, areaType:"residential", crimeW:3.0, light:8.0, policePx:7.0, winePx:3.5, cctv:7.0, traffic:7.0, nightRisk:0.35 },
  { name:"Defence Colony", lat:28.5720, lon:77.2310, radius:1.0, areaType:"residential", crimeW:2.5, light:8.5, policePx:7.5, winePx:3.0, cctv:8.0, traffic:7.0, nightRisk:0.3 },
  { name:"Greater Kailash", lat:28.5490, lon:77.2400, radius:1.5, areaType:"residential", crimeW:3.0, light:8.0, policePx:7.0, winePx:3.5, cctv:7.5, traffic:7.5, nightRisk:0.32 },
  { name:"Hauz Khas", lat:28.5494, lon:77.2001, radius:1.2, areaType:"mixed", crimeW:3.5, light:7.5, policePx:6.5, winePx:5.0, cctv:7.0, traffic:7.0, nightRisk:0.4 },
  { name:"Sarojini Nagar", lat:28.5750, lon:77.1940, radius:1.0, areaType:"commercial", crimeW:5.5, light:7.0, policePx:6.0, winePx:4.5, cctv:6.0, traffic:8.0, nightRisk:0.5 },
  { name:"Karol Bagh", lat:28.6521, lon:77.1905, radius:1.5, areaType:"commercial", crimeW:5.0, light:7.5, policePx:6.5, winePx:5.5, cctv:6.5, traffic:8.5, nightRisk:0.5 },
  { name:"Chandni Chowk", lat:28.6506, lon:77.2334, radius:1.0, areaType:"commercial", crimeW:6.5, light:6.0, policePx:5.0, winePx:6.0, cctv:5.0, traffic:9.0, nightRisk:0.65 },
  { name:"Saket", lat:28.5244, lon:77.2065, radius:1.5, areaType:"commercial", crimeW:3.5, light:8.0, policePx:7.0, winePx:4.0, cctv:8.0, traffic:7.5, nightRisk:0.35 },
  { name:"Lajpat Nagar", lat:28.5688, lon:77.2420, radius:1.0, areaType:"commercial", crimeW:5.0, light:7.0, policePx:6.0, winePx:5.0, cctv:6.0, traffic:8.0, nightRisk:0.5 },
  { name:"Dwarka", lat:28.5921, lon:77.0460, radius:3.0, areaType:"residential", crimeW:4.0, light:7.5, policePx:6.0, winePx:3.0, cctv:6.5, traffic:6.5, nightRisk:0.4 },
  { name:"Rohini", lat:28.7320, lon:77.1102, radius:2.5, areaType:"residential", crimeW:4.5, light:7.0, policePx:5.5, winePx:4.0, cctv:5.5, traffic:6.5, nightRisk:0.45 },
  { name:"Pitampura", lat:28.7013, lon:77.1315, radius:1.5, areaType:"residential", crimeW:4.5, light:7.0, policePx:6.0, winePx:4.0, cctv:6.0, traffic:7.0, nightRisk:0.42 },
  { name:"Janakpuri", lat:28.6236, lon:77.0780, radius:2.0, areaType:"residential", crimeW:4.0, light:7.0, policePx:6.0, winePx:3.5, cctv:6.0, traffic:6.5, nightRisk:0.4 },
  { name:"Nehru Place", lat:28.5490, lon:77.2530, radius:1.0, areaType:"commercial", crimeW:5.0, light:7.0, policePx:6.5, winePx:4.5, cctv:6.5, traffic:8.0, nightRisk:0.5 },
  { name:"Okhla Industrial", lat:28.5310, lon:77.2710, radius:2.0, areaType:"industrial", crimeW:6.5, light:4.5, policePx:4.0, winePx:6.5, cctv:4.0, traffic:6.0, nightRisk:0.7 },
  { name:"Noida Border", lat:28.5800, lon:77.3300, radius:2.0, areaType:"mixed", crimeW:5.5, light:6.0, policePx:4.5, winePx:5.0, cctv:5.0, traffic:7.0, nightRisk:0.55 },
  { name:"IIT Delhi", lat:28.5450, lon:77.1926, radius:0.8, areaType:"govt", crimeW:2.0, light:8.5, policePx:7.5, winePx:1.0, cctv:8.0, traffic:6.5, nightRisk:0.25 },
  { name:"JNU", lat:28.5397, lon:77.1685, radius:1.0, areaType:"govt", crimeW:2.5, light:7.5, policePx:6.5, winePx:1.5, cctv:6.5, traffic:5.0, nightRisk:0.3 },
  { name:"Delhi Cantt", lat:28.5900, lon:77.1500, radius:2.0, areaType:"govt", crimeW:2.0, light:8.0, policePx:8.0, winePx:1.0, cctv:7.5, traffic:5.5, nightRisk:0.2 },
  { name:"IGI Airport", lat:28.5562, lon:77.1000, radius:2.5, areaType:"govt", crimeW:1.5, light:9.5, policePx:9.0, winePx:0.5, cctv:10, traffic:8.0, nightRisk:0.15 },
  { name:"AIIMS", lat:28.5672, lon:77.2100, radius:0.8, areaType:"govt", crimeW:3.0, light:8.0, policePx:7.0, winePx:2.0, cctv:8.0, traffic:7.5, nightRisk:0.3 },
  { name:"Pragati Maidan", lat:28.6189, lon:77.2488, radius:1.0, areaType:"govt", crimeW:3.0, light:8.0, policePx:7.5, winePx:2.0, cctv:7.5, traffic:7.0, nightRisk:0.3 },
  { name:"Old Delhi Station", lat:28.6615, lon:77.2280, radius:0.8, areaType:"commercial", crimeW:7.0, light:5.5, policePx:5.5, winePx:6.5, cctv:5.0, traffic:9.0, nightRisk:0.7 },
  { name:"Kashmere Gate", lat:28.6680, lon:77.2290, radius:1.0, areaType:"mixed", crimeW:6.5, light:5.5, policePx:5.0, winePx:6.0, cctv:5.0, traffic:8.0, nightRisk:0.65 },
  { name:"Sadar Bazaar", lat:28.6550, lon:77.2060, radius:0.8, areaType:"commercial", crimeW:6.0, light:6.0, policePx:5.5, winePx:5.5, cctv:5.0, traffic:8.5, nightRisk:0.6 },
  { name:"Shahdara", lat:28.6730, lon:77.2880, radius:2.0, areaType:"mixed", crimeW:7.0, light:4.5, policePx:4.0, winePx:6.0, cctv:3.5, traffic:6.0, nightRisk:0.72 },
  { name:"Narela", lat:28.8520, lon:77.0930, radius:3.0, areaType:"residential", crimeW:6.5, light:3.5, policePx:3.0, winePx:5.0, cctv:2.0, traffic:3.5, nightRisk:0.7 },
  { name:"Badarpur", lat:28.5090, lon:77.3030, radius:1.5, areaType:"mixed", crimeW:7.0, light:4.0, policePx:3.5, winePx:6.5, cctv:3.0, traffic:5.5, nightRisk:0.75 },
  { name:"Mehrauli", lat:28.5180, lon:77.1720, radius:1.5, areaType:"mixed", crimeW:5.5, light:5.5, policePx:5.0, winePx:5.0, cctv:5.0, traffic:5.5, nightRisk:0.55 },
  { name:"Mayur Vihar", lat:28.5930, lon:77.2990, radius:1.5, areaType:"residential", crimeW:4.5, light:7.0, policePx:6.0, winePx:4.0, cctv:6.0, traffic:7.0, nightRisk:0.42 },
  { name:"Rajouri Garden", lat:28.6450, lon:77.1230, radius:1.5, areaType:"commercial", crimeW:4.5, light:7.0, policePx:6.0, winePx:4.5, cctv:6.0, traffic:7.5, nightRisk:0.45 },
];

const BOUNDS = { minLat: 28.40, maxLat: 28.88, minLon: 76.84, maxLon: 77.35 };
const ROWS = 48, COLS = 51;

// ========== Regenerate data exactly as training did ==========

function regenerateData() {
  const latStep = (BOUNDS.maxLat - BOUNDS.minLat) / ROWS;
  const lonStep = (BOUNDS.maxLon - BOUNDS.minLon) / COLS;

  const raw: any[][] = [];
  for (let r = 0; r < ROWS; r++) {
    raw[r] = [];
    for (let c = 0; c < COLS; c++) {
      const lat = BOUNDS.minLat + (r + 0.5) * latStep;
      const lon = BOUNDS.minLon + (c + 0.5) * lonStep;
      let crimeW = 5, light = 5, policePx = 4.5, winePx = 4, cctv = 4, traffic = 5, nightRisk = 0.6;
      let tw = 0.2;
      let areaType = "residential";
      let closestDist = Infinity;
      for (const z of ZONES) {
        const d = haversine(lat, lon, z.lat, z.lon);
        if (d > z.radius * 3) continue;
        const inf = Math.max(0, 1 - d / (z.radius * 2.5));
        const w = inf * inf;
        const blend = (cur: number, zVal: number) => (cur * tw + zVal * w) / (tw + w);
        crimeW = blend(crimeW, z.crimeW); light = blend(light, z.light);
        policePx = blend(policePx, z.policePx); winePx = blend(winePx, z.winePx);
        cctv = blend(cctv, z.cctv); traffic = blend(traffic, z.traffic);
        nightRisk = blend(nightRisk, z.nightRisk); tw += w;
        if (d < closestDist) { closestDist = d; areaType = z.areaType; }
      }
      crimeW = clamp(crimeW + gauss(0, 0.8), 0, 10);
      light = clamp(light + gauss(0, 0.7), 0, 10);
      policePx = clamp(policePx + gauss(0, 0.6), 0, 10);
      winePx = clamp(winePx + gauss(0, 0.7), 0, 10);
      cctv = clamp(cctv + gauss(0, 0.6), 0, 10);
      traffic = clamp(traffic + gauss(0, 0.7), 0, 10);
      nightRisk = clamp(nightRisk + gauss(0, 0.08), 0.05, 0.95);
      raw[r][c] = { crimeW: rnd2(crimeW), light: rnd2(light), policePx: rnd2(policePx), winePx: rnd2(winePx), cctv: rnd2(cctv), traffic: rnd2(traffic), nightRisk: rnd2(nightRisk), areaType };
    }
  }

  // Smoothing
  const smoothed: any[][] = [];
  for (let r = 0; r < ROWS; r++) {
    smoothed[r] = [];
    for (let c = 0; c < COLS; c++) {
      let sC = 0, sL = 0, sP = 0, sW = 0, sV = 0, sT = 0, sN = 0, cnt = 0;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
          const w = (dr === 0 && dc === 0) ? 2 : 1;
          sC += raw[nr][nc].crimeW * w; sL += raw[nr][nc].light * w; sP += raw[nr][nc].policePx * w;
          sW += raw[nr][nc].winePx * w; sV += raw[nr][nc].cctv * w; sT += raw[nr][nc].traffic * w;
          sN += raw[nr][nc].nightRisk * w; cnt += w;
        }
      }
      smoothed[r][c] = { ...raw[r][c], crimeW: rnd2(sC / cnt), light: rnd2(sL / cnt), policePx: rnd2(sP / cnt), winePx: rnd2(sW / cnt), cctv: rnd2(sV / cnt), traffic: rnd2(sT / cnt), nightRisk: rnd2(sN / cnt) };
    }
  }

  function groundTruthSafety(crimeW: number, light: number, policePx: number, winePx: number, cctv: number, traffic: number): number {
    const score = 72 - 13.0 * (crimeW - 5) + 6.0 * (light - 5) + 4.5 * (policePx - 5) - 5.0 * (winePx - 5) + 4.0 * (cctv - 5) + 5.5 * (traffic - 5);
    const crimePenalty = crimeW > 7 ? (crimeW - 7) * 5 : 0;
    const cctvBonus = cctv > 7 ? (cctv - 7) * 2 : 0;
    return clamp(score - crimePenalty + cctvBonus + gauss(0, 2.5), 5, 95);
  }

  const X: number[][] = [];
  const y: number[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const s = smoothed[r][c];
      X.push([s.crimeW, s.light, s.policePx, s.winePx, s.cctv, s.traffic]);
      y.push(groundTruthSafety(s.crimeW, s.light, s.policePx, s.winePx, s.cctv, s.traffic));
    }
  }
  return { X, y };
}

// ========== Load model & predict ==========

interface TreeNode { v?: number; f?: number; t?: number; l?: TreeNode; r?: TreeNode; }
interface XGBModel { trees: TreeNode[]; basePred: number; lr: number; featureNames: string[]; }

function predictTree(node: TreeNode, x: number[]): number {
  if (node.v !== undefined) return node.v;
  return x[node.f!] <= node.t! ? predictTree(node.l!, x) : predictTree(node.r!, x);
}

function xgbPredict(model: XGBModel, x: number[]): number {
  let pred = model.basePred;
  for (const tree of model.trees) pred += model.lr * predictTree(tree, x);
  return pred;
}

// ========== Metrics ==========

function main() {
  console.log("\n" + "=".repeat(65));
  console.log("  HerWay XGBoost Safety Model — Performance Metrics Report");
  console.log("=".repeat(65) + "\n");

  // Load model
  const modelPath = path.join(process.cwd(), "public/data/xgboost-safety-model.json");
  if (!fs.existsSync(modelPath)) { console.error("Model file not found at", modelPath); process.exit(1); }
  const model: XGBModel = JSON.parse(fs.readFileSync(modelPath, "utf-8"));
  console.log(`Model: ${model.trees.length} gradient boosted decision trees`);
  console.log(`Features: ${model.featureNames.join(", ")}`);
  console.log(`Learning Rate: ${model.lr}`);
  console.log(`Base Prediction: ${model.basePred.toFixed(2)}\n`);

  // Regenerate training data
  const { X, y } = regenerateData();
  const n = X.length;
  console.log(`Dataset: ${n} samples (${ROWS}x${COLS} grid cells over Delhi NCR)\n`);

  // Predict
  const predictions = X.map(x => clamp(xgbPredict(model, x), 5, 95));

  // === REGRESSION METRICS ===
  const mean_y = y.reduce((a, b) => a + b, 0) / n;
  let ss_res = 0, ss_tot = 0, mae_sum = 0, mape_sum = 0;
  for (let i = 0; i < n; i++) {
    const err = y[i] - predictions[i];
    ss_res += err * err;
    ss_tot += (y[i] - mean_y) ** 2;
    mae_sum += Math.abs(err);
    if (y[i] > 0) mape_sum += Math.abs(err) / y[i];
  }
  const rmse = Math.sqrt(ss_res / n);
  const r2 = 1 - ss_res / ss_tot;
  const mae = mae_sum / n;
  const mape = (mape_sum / n) * 100;

  console.log("─── Regression Metrics ───────────────────────────────");
  console.log(`  RMSE (Root Mean Squared Error)   : ${rmse.toFixed(4)}`);
  console.log(`  MAE  (Mean Absolute Error)       : ${mae.toFixed(4)}`);
  console.log(`  R²   (Coefficient of Determination): ${r2.toFixed(6)}`);
  console.log(`  MAPE (Mean Abs % Error)          : ${mape.toFixed(2)}%`);
  console.log(`  Explained Variance               : ${(r2 * 100).toFixed(2)}%\n`);

  // === CLASSIFICATION METRICS ===
  // Classify into Safe (>=60), Moderate (40-60), Unsafe (<40)
  function classify(score: number): string {
    if (score >= 60) return "Safe";
    if (score >= 40) return "Moderate";
    return "Unsafe";
  }

  const classes = ["Unsafe", "Moderate", "Safe"];
  const yClass = y.map(classify);
  const pClass = predictions.map(classify);

  // Confusion matrix
  const cm: Record<string, Record<string, number>> = {};
  for (const c of classes) { cm[c] = {}; for (const c2 of classes) cm[c][c2] = 0; }
  let correct = 0;
  for (let i = 0; i < n; i++) {
    cm[yClass[i]][pClass[i]]++;
    if (yClass[i] === pClass[i]) correct++;
  }

  const accuracy = correct / n;

  console.log("─── Classification Metrics (Safe/Moderate/Unsafe) ───");
  console.log(`  Overall Accuracy: ${(accuracy * 100).toFixed(2)}%\n`);

  // Per-class precision, recall, f1
  console.log("  Per-Class Metrics:");
  console.log("  " + "-".repeat(55));
  console.log(`  ${'Class'.padEnd(12)} ${'Precision'.padEnd(12)} ${'Recall'.padEnd(12)} ${'F1-Score'.padEnd(12)} ${'Support'}`);
  console.log("  " + "-".repeat(55));

  let macroP = 0, macroR = 0, macroF = 0, weightedP = 0, weightedR = 0, weightedF = 0, totalSupport = 0;

  for (const cls of classes) {
    const tp = cm[cls][cls];
    let fp = 0, fn = 0;
    for (const c of classes) {
      if (c !== cls) { fp += cm[c][cls]; fn += cm[cls][c]; }
    }
    const support = tp + fn; // fn here is wrong, need to fix
    // Actually: support = all actual instances of cls
    const actualSupport = classes.reduce((s, c2) => s + cm[cls][c2], 0);
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = actualSupport > 0 ? tp / actualSupport : 0;
    const f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;

    console.log(`  ${cls.padEnd(12)} ${(precision * 100).toFixed(2).padStart(6)}%      ${(recall * 100).toFixed(2).padStart(6)}%      ${(f1 * 100).toFixed(2).padStart(6)}%      ${actualSupport}`);

    macroP += precision; macroR += recall; macroF += f1;
    weightedP += precision * actualSupport; weightedR += recall * actualSupport; weightedF += f1 * actualSupport;
    totalSupport += actualSupport;
  }

  console.log("  " + "-".repeat(55));
  console.log(`  ${'Macro Avg'.padEnd(12)} ${((macroP / 3) * 100).toFixed(2).padStart(6)}%      ${((macroR / 3) * 100).toFixed(2).padStart(6)}%      ${((macroF / 3) * 100).toFixed(2).padStart(6)}%      ${totalSupport}`);
  console.log(`  ${'Weighted'.padEnd(12)} ${((weightedP / totalSupport) * 100).toFixed(2).padStart(6)}%      ${((weightedR / totalSupport) * 100).toFixed(2).padStart(6)}%      ${((weightedF / totalSupport) * 100).toFixed(2).padStart(6)}%      ${totalSupport}`);

  // Confusion matrix display
  console.log("\n─── Confusion Matrix ─────────────────────────────────");
  console.log(`  ${'Actual \\ Pred'.padEnd(16)} ${classes.map(c => c.padStart(10)).join('')}`);
  for (const actual of classes) {
    const row = classes.map(pred => String(cm[actual][pred]).padStart(10)).join('');
    console.log(`  ${actual.padEnd(16)} ${row}`);
  }

  // Score distribution
  console.log("\n─── Score Distribution ───────────────────────────────");
  const actuals = { Unsafe: yClass.filter(c => c === "Unsafe").length, Moderate: yClass.filter(c => c === "Moderate").length, Safe: yClass.filter(c => c === "Safe").length };
  console.log(`  Ground Truth: Unsafe=${actuals.Unsafe} (${(actuals.Unsafe/n*100).toFixed(1)}%), Moderate=${actuals.Moderate} (${(actuals.Moderate/n*100).toFixed(1)}%), Safe=${actuals.Safe} (${(actuals.Safe/n*100).toFixed(1)}%)`);
  const preds = { Unsafe: pClass.filter(c => c === "Unsafe").length, Moderate: pClass.filter(c => c === "Moderate").length, Safe: pClass.filter(c => c === "Safe").length };
  console.log(`  Predictions : Unsafe=${preds.Unsafe} (${(preds.Unsafe/n*100).toFixed(1)}%), Moderate=${preds.Moderate} (${(preds.Moderate/n*100).toFixed(1)}%), Safe=${preds.Safe} (${(preds.Safe/n*100).toFixed(1)}%)`);

  // Error analysis
  console.log("\n─── Error Analysis ───────────────────────────────────");
  const errors = y.map((yi, i) => Math.abs(yi - predictions[i]));
  errors.sort((a, b) => a - b);
  console.log(`  Min Error    : ${errors[0].toFixed(4)}`);
  console.log(`  Median Error : ${errors[Math.floor(n / 2)].toFixed(4)}`);
  console.log(`  P90 Error    : ${errors[Math.floor(n * 0.9)].toFixed(4)}`);
  console.log(`  P95 Error    : ${errors[Math.floor(n * 0.95)].toFixed(4)}`);
  console.log(`  Max Error    : ${errors[n - 1].toFixed(4)}`);
  const within5 = errors.filter(e => e <= 5).length;
  const within10 = errors.filter(e => e <= 10).length;
  console.log(`  Within ±5 pts: ${within5}/${n} (${(within5/n*100).toFixed(1)}%)`);
  console.log(`  Within ±10 pts: ${within10}/${n} (${(within10/n*100).toFixed(1)}%)`);

  // Feature importance (by counting splits)
  console.log("\n─── Feature Importance (Split Count) ─────────────────");
  const splitCounts = new Array(6).fill(0);
  function countSplits(node: TreeNode) {
    if (node.v !== undefined) return;
    splitCounts[node.f!]++;
    if (node.l) countSplits(node.l);
    if (node.r) countSplits(node.r);
  }
  for (const tree of model.trees) countSplits(tree);
  const totalSplits = splitCounts.reduce((a, b) => a + b, 0);
  const featureImportance = model.featureNames.map((name, i) => ({ name, splits: splitCounts[i], pct: (splitCounts[i] / totalSplits * 100) }));
  featureImportance.sort((a, b) => b.splits - a.splits);
  for (const f of featureImportance) {
    const bar = "█".repeat(Math.round(f.pct / 2));
    console.log(`  ${f.name.padEnd(25)} ${String(f.splits).padStart(5)} (${f.pct.toFixed(1).padStart(5)}%) ${bar}`);
  }

  console.log("\n" + "=".repeat(65));
  console.log("  Report complete. Use these metrics in your presentation.");
  console.log("=".repeat(65) + "\n");
}

main();
