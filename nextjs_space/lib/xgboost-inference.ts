// lib/xgboost-inference.ts
import fs from "fs";
import path from "path";

interface TreeNode {
  f?: number;
  t?: number;
  l?: TreeNode;
  r?: TreeNode;
  v?: number;
}

interface XGBoostModel {
  trees: TreeNode[];
  basePred: number;
  lr: number;
  featureNames: string[];
}

let _model: XGBoostModel | null = null;

export function loadXGBoostModel(): XGBoostModel {
  if (_model) return _model;
  const filePath = path.join(process.cwd(), "public", "data", "xgboost-safety-model.json");
  const raw = fs.readFileSync(filePath, "utf-8");
  _model = JSON.parse(raw);
  return _model!;
}

function traverseTree(node: TreeNode, features: number[]): number {
  if (node.v !== undefined) return node.v;
  const val = features[node.f!];
  return traverseTree(val <= node.t! ? node.l! : node.r!, features);
}

export function predictSafety(model: XGBoostModel, featureValues: number[]): number {
  let score = model.basePred;
  for (const tree of model.trees) {
    score += model.lr * traverseTree(tree, featureValues);
  }
  return Math.max(0, Math.min(100, score));
}

export function predictSafetyFromCell(
  model: XGBoostModel,
  cell: Record<string, number>
): number {
  const features = model.featureNames.map((name) => cell[name] ?? 0);
  return predictSafety(model, features);
}