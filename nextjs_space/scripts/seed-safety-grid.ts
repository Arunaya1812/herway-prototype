/**
 * XGBoost-trained Delhi Safety Grid Generator
 *
 * Features (user-specified):
 *   crimeRateWomen      (0-10, HIGH PRIORITY) - crimes against women
 *   streetLightDensity   (0-10, HIGH PRIORITY) - street lighting coverage
 *   policeProximityScore (0-10) - closeness to police stations
 *   wineShopProximityScore (0-10) - number/closeness of liquor shops (worse safety)
 *   cctvCoverage         (0-10) - CCTV density
 *   trafficDensity       (0-10, HIGH PRIORITY) - vehicle/pedestrian traffic
 *
 * Pipeline:
 *   1. Generate synthetic features for 2448 grid cells from 42 Delhi zone seeds
 *   2. Add Gaussian noise + spatial smoothing
 *   3. Generate training labels with known safety formula
 *   4. Train XGBoost (gradient boosted decision trees) on the data
 *   5. Use model predictions as baseSafetyScore
 *   6. Save model JSON + seed database
 */

import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

// Delhi bounds & grid
const BOUNDS = { minLat: 28.40, maxLat: 28.88, minLon: 76.84, maxLon: 77.35 };
const ROWS = 48, COLS = 51;

// Seeded PRNG
function mulberry32(a: number) {
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rng = mulberry32(42);
function gauss(m: number, s: number) { const u1 = rng(), u2 = rng(); return m + Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2) * s; }
function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
function rnd2(v: number) { return Math.round(v * 100) / 100; }

interface ZoneSeed {
  name: string; lat: number; lon: number; radius: number; areaType: string;
  crimeW: number; light: number; policePx: number; winePx: number; cctv: number; traffic: number; nightRisk: number;
}

// 42 Delhi zone seeds with realistic profiles
const ZONES: ZoneSeed[] = [
  // HIGH RISK
  { name:"GB Road", lat:28.6505, lon:77.2230, radius:0.6, areaType:"mixed", crimeW:8.5, light:3.0, policePx:4.0, winePx:8.5, cctv:2.0, traffic:6.0, nightRisk:0.85 },
  { name:"Seelampur", lat:28.6840, lon:77.2680, radius:1.5, areaType:"slum", crimeW:8.8, light:2.5, policePx:2.5, winePx:7.0, cctv:1.5, traffic:5.0, nightRisk:0.9 },
  { name:"Jahangirpuri", lat:28.7290, lon:77.1720, radius:1.8, areaType:"slum", crimeW:9.0, light:2.0, policePx:2.5, winePx:7.5, cctv:1.5, traffic:4.0, nightRisk:0.92 },
  { name:"Mangolpuri", lat:28.7090, lon:77.0670, radius:1.8, areaType:"residential", crimeW:8.5, light:3.0, policePx:3.0, winePx:6.5, cctv:2.0, traffic:4.0, nightRisk:0.88 },
  { name:"Seemapuri", lat:28.6880, lon:77.3210, radius:1.4, areaType:"slum", crimeW:8.7, light:2.5, policePx:2.5, winePx:7.0, cctv:1.5, traffic:4.0, nightRisk:0.9 },
  { name:"Nand Nagri", lat:28.6950, lon:77.3050, radius:1.2, areaType:"residential", crimeW:8.0, light:3.0, policePx:3.0, winePx:6.0, cctv:2.0, traffic:4.5, nightRisk:0.85 },
  { name:"Trilokpuri", lat:28.6080, lon:77.3100, radius:1.0, areaType:"residential", crimeW:7.8, light:3.5, policePx:3.0, winePx:5.5, cctv:2.5, traffic:5.0, nightRisk:0.82 },
  { name:"Sangam Vihar", lat:28.5080, lon:77.2500, radius:1.8, areaType:"slum", crimeW:8.2, light:2.5, policePx:2.5, winePx:7.0, cctv:1.5, traffic:4.0, nightRisk:0.88 },
  { name:"Wazirabad", lat:28.7240, lon:77.2300, radius:1.0, areaType:"mixed", crimeW:7.5, light:3.0, policePx:3.0, winePx:5.5, cctv:2.0, traffic:4.5, nightRisk:0.8 },
  { name:"Okhla Industrial", lat:28.5310, lon:77.2710, radius:1.2, areaType:"industrial", crimeW:7.0, light:3.5, policePx:3.0, winePx:6.0, cctv:3.0, traffic:3.0, nightRisk:0.85 },
  { name:"Paharganj", lat:28.6440, lon:77.2139, radius:0.5, areaType:"commercial", crimeW:7.0, light:5.0, policePx:5.0, winePx:7.5, cctv:3.5, traffic:7.5, nightRisk:0.7 },
  { name:"Nabi Karim", lat:28.6430, lon:77.2120, radius:0.6, areaType:"mixed", crimeW:7.5, light:4.0, policePx:4.0, winePx:6.5, cctv:3.0, traffic:5.5, nightRisk:0.75 },
  { name:"Shahdara", lat:28.6740, lon:77.2920, radius:1.5, areaType:"residential", crimeW:7.5, light:4.0, policePx:3.5, winePx:5.5, cctv:3.0, traffic:5.0, nightRisk:0.78 },
  { name:"ISBT Kashmere Gate", lat:28.6680, lon:77.2290, radius:0.8, areaType:"commercial", crimeW:7.0, light:5.5, policePx:5.5, winePx:5.0, cctv:4.0, traffic:7.0, nightRisk:0.72 },
  { name:"Yamuna Bank", lat:28.6500, lon:77.2800, radius:2.0, areaType:"mixed", crimeW:7.2, light:2.0, policePx:2.0, winePx:3.0, cctv:1.5, traffic:2.5, nightRisk:0.9 },
  { name:"Bawana", lat:28.7900, lon:77.0500, radius:2.0, areaType:"industrial", crimeW:7.5, light:2.5, policePx:2.5, winePx:4.0, cctv:2.0, traffic:3.0, nightRisk:0.88 },
  { name:"Timarpur", lat:28.6920, lon:77.2200, radius:0.8, areaType:"mixed", crimeW:6.5, light:4.0, policePx:4.0, winePx:4.0, cctv:3.0, traffic:4.0, nightRisk:0.7 },
  // MODERATE
  { name:"Karol Bagh", lat:28.6519, lon:77.1901, radius:0.8, areaType:"commercial", crimeW:5.5, light:6.0, policePx:5.5, winePx:5.0, cctv:4.5, traffic:7.5, nightRisk:0.55 },
  { name:"Lajpat Nagar", lat:28.5707, lon:77.2395, radius:0.8, areaType:"commercial", crimeW:5.0, light:6.5, policePx:5.5, winePx:4.5, cctv:5.0, traffic:7.5, nightRisk:0.5 },
  { name:"Janakpuri", lat:28.6218, lon:77.0786, radius:1.5, areaType:"residential", crimeW:4.5, light:6.5, policePx:5.5, winePx:3.5, cctv:5.0, traffic:6.0, nightRisk:0.5 },
  { name:"Rohini", lat:28.7360, lon:77.1090, radius:2.0, areaType:"residential", crimeW:5.0, light:6.0, policePx:5.0, winePx:4.0, cctv:4.5, traffic:5.5, nightRisk:0.55 },
  { name:"Pitampura", lat:28.7012, lon:77.1344, radius:1.2, areaType:"residential", crimeW:4.5, light:6.5, policePx:5.5, winePx:3.5, cctv:5.0, traffic:6.0, nightRisk:0.5 },
  { name:"Chandni Chowk", lat:28.6562, lon:77.2310, radius:0.5, areaType:"commercial", crimeW:6.0, light:6.0, policePx:5.5, winePx:4.0, cctv:4.0, traffic:9.0, nightRisk:0.65 },
  { name:"Nehru Place", lat:28.5491, lon:77.2530, radius:0.6, areaType:"commercial", crimeW:5.0, light:6.5, policePx:5.5, winePx:3.5, cctv:5.0, traffic:7.0, nightRisk:0.55 },
  { name:"Rajouri Garden", lat:28.6487, lon:77.1215, radius:1.0, areaType:"commercial", crimeW:5.0, light:6.5, policePx:5.5, winePx:4.5, cctv:5.0, traffic:7.0, nightRisk:0.5 },
  { name:"Mayur Vihar", lat:28.5940, lon:77.2970, radius:1.5, areaType:"residential", crimeW:4.5, light:6.5, policePx:5.5, winePx:3.0, cctv:5.0, traffic:6.0, nightRisk:0.5 },
  { name:"Patparganj", lat:28.6180, lon:77.2900, radius:1.0, areaType:"residential", crimeW:5.0, light:6.0, policePx:5.0, winePx:4.0, cctv:4.5, traffic:5.5, nightRisk:0.55 },
  // SAFE
  { name:"Connaught Place", lat:28.6315, lon:77.2167, radius:0.8, areaType:"commercial", crimeW:3.0, light:9.0, policePx:9.0, winePx:2.0, cctv:9.0, traffic:9.0, nightRisk:0.3 },
  { name:"India Gate", lat:28.6129, lon:77.2295, radius:0.8, areaType:"govt", crimeW:2.0, light:9.0, policePx:10.0, winePx:0.5, cctv:10.0, traffic:8.0, nightRisk:0.2 },
  { name:"Lutyens Delhi", lat:28.5970, lon:77.2090, radius:2.5, areaType:"govt", crimeW:1.5, light:9.5, policePx:10.0, winePx:0.5, cctv:10.0, traffic:5.0, nightRisk:0.15 },
  { name:"Vasant Vihar", lat:28.5574, lon:77.1608, radius:1.5, areaType:"residential", crimeW:3.0, light:8.0, policePx:7.0, winePx:2.0, cctv:7.0, traffic:5.5, nightRisk:0.3 },
  { name:"Defence Colony", lat:28.5741, lon:77.2340, radius:0.8, areaType:"residential", crimeW:3.0, light:8.0, policePx:7.5, winePx:2.0, cctv:7.0, traffic:6.0, nightRisk:0.3 },
  { name:"Greater Kailash", lat:28.5494, lon:77.2349, radius:1.0, areaType:"residential", crimeW:3.5, light:7.5, policePx:7.0, winePx:2.5, cctv:7.0, traffic:7.0, nightRisk:0.35 },
  { name:"Hauz Khas", lat:28.5494, lon:77.2001, radius:0.8, areaType:"commercial", crimeW:4.0, light:7.5, policePx:6.5, winePx:4.0, cctv:6.5, traffic:8.0, nightRisk:0.4 },
  { name:"Dwarka", lat:28.5921, lon:77.0460, radius:3.0, areaType:"residential", crimeW:4.0, light:7.0, policePx:6.0, winePx:3.0, cctv:6.0, traffic:6.0, nightRisk:0.45 },
  { name:"Saket", lat:28.5244, lon:77.2167, radius:1.0, areaType:"commercial", crimeW:3.0, light:8.0, policePx:7.5, winePx:2.0, cctv:8.0, traffic:8.0, nightRisk:0.3 },
  { name:"South Extension", lat:28.5740, lon:77.2190, radius:0.6, areaType:"commercial", crimeW:3.5, light:8.0, policePx:7.0, winePx:3.0, cctv:7.0, traffic:8.0, nightRisk:0.35 },
  { name:"Vasant Kunj", lat:28.5195, lon:77.1594, radius:2.0, areaType:"residential", crimeW:3.5, light:7.5, policePx:6.5, winePx:2.0, cctv:6.5, traffic:5.5, nightRisk:0.35 },
  { name:"Chanakyapuri", lat:28.5872, lon:77.1767, radius:1.0, areaType:"govt", crimeW:1.5, light:9.0, policePx:10.0, winePx:0.5, cctv:10.0, traffic:4.0, nightRisk:0.15 },
  { name:"IIT Delhi", lat:28.5450, lon:77.1926, radius:0.8, areaType:"residential", crimeW:3.0, light:7.5, policePx:6.5, winePx:1.5, cctv:6.5, traffic:7.0, nightRisk:0.35 },
  { name:"Aerocity/IGI", lat:28.5550, lon:77.0950, radius:1.5, areaType:"commercial", crimeW:2.5, light:9.0, policePx:8.5, winePx:1.0, cctv:9.0, traffic:6.0, nightRisk:0.25 },
  { name:"Noida Sec 18", lat:28.5706, lon:77.3256, radius:1.5, areaType:"commercial", crimeW:4.0, light:7.5, policePx:6.5, winePx:3.5, cctv:7.0, traffic:7.0, nightRisk:0.4 },
];

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371, dLat = ((lat2-lat1)*Math.PI)/180, dLon = ((lon2-lon1)*Math.PI)/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ========== XGBoost Implementation ==========

interface TreeNode {
  f?: number;      // feature index for split
  t?: number;      // threshold
  l?: TreeNode;    // left child (<=threshold)
  r?: TreeNode;    // right child (>threshold)
  v?: number;      // leaf value
}

interface XGBModel {
  trees: TreeNode[];
  basePred: number;
  lr: number;
  featureNames: string[];
}

function mean(arr: number[]): number { return arr.reduce((s,v)=>s+v,0)/arr.length; }
function variance(arr: number[]): number { const m = mean(arr); return arr.reduce((s,v)=>s+(v-m)**2,0)/arr.length; }

function buildTree(X: number[][], y: number[], depth: number, maxDepth: number, minLeaf: number): TreeNode {
  if (depth >= maxDepth || y.length < minLeaf * 2) {
    return { v: mean(y) };
  }
  let bestGain = 0, bestF = 0, bestT = 0;
  const pVar = variance(y);
  const nFeats = X[0].length;

  for (let f = 0; f < nFeats; f++) {
    // Sample thresholds (up to 20 quantiles for speed)
    const vals = X.map(x => x[f]).sort((a,b)=>a-b);
    const step = Math.max(1, Math.floor(vals.length / 20));
    for (let i = step; i < vals.length; i += step) {
      const t = (vals[i-1] + vals[i]) / 2;
      const lY: number[] = [], rY: number[] = [];
      for (let j = 0; j < X.length; j++) {
        if (X[j][f] <= t) lY.push(y[j]); else rY.push(y[j]);
      }
      if (lY.length < minLeaf || rY.length < minLeaf) continue;
      const gain = pVar - (lY.length*variance(lY) + rY.length*variance(rY)) / y.length;
      if (gain > bestGain) { bestGain = gain; bestF = f; bestT = t; }
    }
  }

  if (bestGain < 0.01) return { v: mean(y) };

  const lIdx: number[] = [], rIdx: number[] = [];
  for (let i = 0; i < X.length; i++) {
    if (X[i][bestF] <= bestT) lIdx.push(i); else rIdx.push(i);
  }

  return {
    f: bestF, t: rnd2(bestT),
    l: buildTree(lIdx.map(i=>X[i]), lIdx.map(i=>y[i]), depth+1, maxDepth, minLeaf),
    r: buildTree(rIdx.map(i=>X[i]), rIdx.map(i=>y[i]), depth+1, maxDepth, minLeaf),
  };
}

function predictTree(node: TreeNode, x: number[]): number {
  if (node.v !== undefined) return node.v;
  return x[node.f!] <= node.t! ? predictTree(node.l!, x) : predictTree(node.r!, x);
}

function trainXGBoost(X: number[][], y: number[], nTrees: number, lr: number, maxDepth: number): XGBModel {
  const basePred = mean(y);
  const preds = new Array(y.length).fill(basePred);
  const trees: TreeNode[] = [];

  for (let t = 0; t < nTrees; t++) {
    // Gradient = negative residuals
    const residuals = y.map((yi, i) => yi - preds[i]);
    const tree = buildTree(X, residuals, 0, maxDepth, 5);
    trees.push(tree);
    for (let i = 0; i < X.length; i++) {
      preds[i] += lr * predictTree(tree, X[i]);
    }
    // Compute training RMSE every 10 trees
    if ((t+1) % 10 === 0) {
      const rmse = Math.sqrt(y.reduce((s,yi,i) => s + (yi-preds[i])**2, 0) / y.length);
      console.log(`  Tree ${t+1}/${nTrees}: RMSE = ${rmse.toFixed(3)}`);
    }
  }

  return { trees, basePred, lr, featureNames: ["crimeRateWomen","streetLightDensity","policeProximityScore","wineShopProximityScore","cctvCoverage","trafficDensity"] };
}

function xgbPredict(model: XGBModel, x: number[]): number {
  let pred = model.basePred;
  for (const tree of model.trees) pred += model.lr * predictTree(tree, x);
  return pred;
}

// ========== Main ==========

async function main() {
  console.log("Generating Delhi safety grid with XGBoost...");
  const latStep = (BOUNDS.maxLat - BOUNDS.minLat) / ROWS;
  const lonStep = (BOUNDS.maxLon - BOUNDS.minLon) / COLS;

  // Phase 1: Generate raw features
  const raw: any[][] = [];
  for (let r = 0; r < ROWS; r++) {
    raw[r] = [];
    for (let c = 0; c < COLS; c++) {
      const lat = BOUNDS.minLat + (r+0.5)*latStep;
      const lon = BOUNDS.minLon + (c+0.5)*lonStep;
      let crimeW=5, light=5, policePx=4.5, winePx=4, cctv=4, traffic=5, nightRisk=0.6;
      let tw = 0.2;
      let areaType = "residential";
      let closestDist = Infinity;

      for (const z of ZONES) {
        const d = haversine(lat, lon, z.lat, z.lon);
        if (d > z.radius * 3) continue;
        const inf = Math.max(0, 1 - d/(z.radius*2.5));
        const w = inf * inf;
        const blend = (cur: number, zVal: number) => (cur*tw + zVal*w) / (tw+w);
        crimeW = blend(crimeW, z.crimeW);
        light = blend(light, z.light);
        policePx = blend(policePx, z.policePx);
        winePx = blend(winePx, z.winePx);
        cctv = blend(cctv, z.cctv);
        traffic = blend(traffic, z.traffic);
        nightRisk = blend(nightRisk, z.nightRisk);
        tw += w;
        if (d < closestDist) { closestDist = d; areaType = z.areaType; }
      }

      // Add Gaussian noise
      crimeW = clamp(crimeW + gauss(0, 0.8), 0, 10);
      light = clamp(light + gauss(0, 0.7), 0, 10);
      policePx = clamp(policePx + gauss(0, 0.6), 0, 10);
      winePx = clamp(winePx + gauss(0, 0.7), 0, 10);
      cctv = clamp(cctv + gauss(0, 0.6), 0, 10);
      traffic = clamp(traffic + gauss(0, 0.7), 0, 10);
      nightRisk = clamp(nightRisk + gauss(0, 0.08), 0.05, 0.95);

      raw[r][c] = { lat: rnd2(lat+rng()*0.001), lon: rnd2(lon+rng()*0.001), crimeW: rnd2(crimeW), light: rnd2(light), policePx: rnd2(policePx), winePx: rnd2(winePx), cctv: rnd2(cctv), traffic: rnd2(traffic), nightRisk: rnd2(nightRisk), areaType };
    }
  }

  // Phase 2: Spatial smoothing (3x3 kernel)
  console.log("Smoothing...");
  const smoothed: any[][] = [];
  for (let r = 0; r < ROWS; r++) {
    smoothed[r] = [];
    for (let c = 0; c < COLS; c++) {
      let sC=0,sL=0,sP=0,sW=0,sV=0,sT=0,sN=0,cnt=0;
      for (let dr=-1;dr<=1;dr++) for (let dc=-1;dc<=1;dc++) {
        const nr=r+dr, nc=c+dc;
        if (nr>=0&&nr<ROWS&&nc>=0&&nc<COLS) {
          const w = (dr===0&&dc===0)?2:1;
          sC+=raw[nr][nc].crimeW*w; sL+=raw[nr][nc].light*w; sP+=raw[nr][nc].policePx*w;
          sW+=raw[nr][nc].winePx*w; sV+=raw[nr][nc].cctv*w; sT+=raw[nr][nc].traffic*w;
          sN+=raw[nr][nc].nightRisk*w; cnt+=w;
        }
      }
      smoothed[r][c] = { ...raw[r][c], crimeW:rnd2(sC/cnt), light:rnd2(sL/cnt), policePx:rnd2(sP/cnt), winePx:rnd2(sW/cnt), cctv:rnd2(sV/cnt), traffic:rnd2(sT/cnt), nightRisk:rnd2(sN/cnt) };
    }
  }

  // Phase 3: Generate training labels using a known ground-truth formula
  // (This is the "oracle" that knows real safety — XGBoost must learn to approximate it)
  function groundTruthSafety(crimeW:number, light:number, policePx:number, winePx:number, cctv:number, traffic:number): number {
    // Higher priority weights for crime, light, traffic
    const score = 72
      - 13.0 * (crimeW - 5)   // HIGH priority
      + 6.0 * (light - 5)     // HIGH priority
      + 4.5 * (policePx - 5)
      - 5.0 * (winePx - 5)    // negative: more wine shops = less safe
      + 4.0 * (cctv - 5)
      + 5.5 * (traffic - 5);  // HIGH priority
    const crimePenalty = crimeW > 7 ? (crimeW-7)*5 : 0;
    const cctvBonus = cctv > 7 ? (cctv-7)*2 : 0;
    // Add small random noise to labels too (prevents perfect fit)
    return clamp(score - crimePenalty + cctvBonus + gauss(0, 2.5), 5, 95);
  }

  const X: number[][] = [];
  const y: number[] = [];
  const cellList: any[] = [];

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const s = smoothed[r][c];
      const features = [s.crimeW, s.light, s.policePx, s.winePx, s.cctv, s.traffic];
      X.push(features);
      y.push(groundTruthSafety(s.crimeW, s.light, s.policePx, s.winePx, s.cctv, s.traffic));
      cellList.push({ r, c, ...s });
    }
  }

  // Phase 4: Train XGBoost
  console.log(`Training XGBoost on ${X.length} samples, 6 features...`);
  const model = trainXGBoost(X, y, 60, 0.15, 5);

  // Use model predictions as baseSafetyScore
  for (let i = 0; i < cellList.length; i++) {
    cellList[i].baseSafety = clamp(Math.round(xgbPredict(model, X[i])), 5, 95);
  }

  // Save model JSON
  const modelPath = path.join(process.cwd(), "public/data");
  fs.mkdirSync(modelPath, { recursive: true });
  fs.writeFileSync(path.join(modelPath, "xgboost-safety-model.json"), JSON.stringify(model, null, 0));
  console.log(`Model saved (${model.trees.length} trees)`);

  // Phase 5: Seed database
  console.log("Writing to database...");
  await prisma.safetyGridCell.deleteMany({ where: { city: "delhi" } });

  const BATCH = 200;
  const dbRows = cellList.map(c => ({
    city: "delhi", gridRow: c.r, gridCol: c.c,
    latitude: c.lat, longitude: c.lon,
    crimeRateWomen: c.crimeW, streetLightDensity: c.light,
    policeProximityScore: c.policePx, wineShopProximityScore: c.winePx,
    cctvCoverage: c.cctv, trafficDensity: c.traffic,
    nightRiskFactor: c.nightRisk, baseSafetyScore: c.baseSafety,
    areaType: c.areaType,
  }));

  for (let i = 0; i < dbRows.length; i += BATCH) {
    await prisma.safetyGridCell.createMany({ data: dbRows.slice(i, i+BATCH) });
    if ((i/BATCH) % 5 === 0) console.log(`  ${Math.min(i+BATCH, dbRows.length)}/${dbRows.length}`);
  }

  // Stats
  const scores = dbRows.map(c => c.baseSafetyScore);
  const avg = mean(scores), min = Math.min(...scores), max = Math.max(...scores);
  const unsafe = scores.filter(s=>s<35).length;
  const mod = scores.filter(s=>s>=35&&s<65).length;
  const safe = scores.filter(s=>s>=65).length;
  console.log(`\nDone! ${dbRows.length} cells.`);
  console.log(`Scores: min=${min}, max=${max}, avg=${avg.toFixed(1)}`);
  console.log(`Unsafe: ${unsafe} (${(unsafe/dbRows.length*100).toFixed(1)}%), Moderate: ${mod} (${(mod/dbRows.length*100).toFixed(1)}%), Safe: ${safe} (${(safe/dbRows.length*100).toFixed(1)}%)`);
}

main().then(() => prisma.$disconnect()).catch(e => { console.error(e); prisma.$disconnect(); process.exit(1); });
