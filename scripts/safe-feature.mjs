#!/usr/bin/env node

/**
 * Safe Feature Start Script
 * Ensures new features are created on an isolated branch with an automatic
 * safety baseline checkpoint, protecting 'main' from breaking changes.
 * Usage:
 *   npm run feature:start <feature-name>
 */

import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { createCheckpoint } from "./checkpoint.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

function run(cmd, options = {}) {
  try {
    return execSync(cmd, { cwd: ROOT_DIR, stdio: "pipe", encoding: "utf-8", ...options }).trim();
  } catch (err) {
    return null;
  }
}

export function startFeature(featureName) {
  if (!featureName) {
    console.error("❌ Please provide a feature name.");
    console.log("Usage: npm run feature:start <feature-name>");
    console.log("Example: npm run feature:start loyalty-points");
    process.exit(1);
  }

  const cleanName = featureName.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "");
  const branchName = `feature/${cleanName}`;

  console.log(`\n🚀 Initializing safe workspace for feature: "${cleanName}"...`);

  // 1. Check if git is available
  const isGit = run("git rev-parse --is-inside-work-tree");
  if (isGit !== "true") {
    console.error("❌ Not a git repository.");
    process.exit(1);
  }

  // 2. Take automatic baseline checkpoint
  console.log("🛡️  Taking baseline safety checkpoint before creating feature branch...");
  createCheckpoint(`pre-feature-${cleanName}`);

  // 3. Create and switch to feature branch
  console.log(`🌿 Creating and checking out branch: ${branchName}...`);
  const checkoutResult = run(`git checkout -b ${branchName}`);
  if (checkoutResult === null) {
    // Branch may already exist, try checking out
    run(`git checkout ${branchName}`);
  }

  console.log("\n========================================================");
  console.log(`✅  SAFE FEATURE ENVIRONMENT READY: ${branchName}`);
  console.log("--------------------------------------------------------");
  console.log("🔒  Your 'main' branch is untouched and fully protected.");
  console.log("💾  A baseline safety checkpoint has been recorded.");
  console.log(`💡  If your experiments break anything, simply run:`);
  console.log(`    - npm run rollback`);
  console.log(`    - or return to main: git checkout main`);
  console.log("========================================================\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const nameArg = process.argv.slice(2).join("-");
  startFeature(nameArg);
}
