#!/usr/bin/env node

/**
 * Rollback Script
 * Safely restores the codebase to any previous checkpoint or git tag.
 * Usage:
 *   npm run rollback --list
 *   npm run rollback <checkpoint-id>
 *   npm run rollback (rolls back to most recent checkpoint)
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import readline from "readline";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const BACKUPS_CODE_DIR = path.join(ROOT_DIR, "backups", "code");
const MANIFEST_PATH = path.join(BACKUPS_CODE_DIR, "manifest.json");

function run(cmd, options = {}) {
  try {
    return execSync(cmd, { cwd: ROOT_DIR, stdio: "pipe", encoding: "utf-8", ...options }).trim();
  } catch (err) {
    return null;
  }
}

function loadManifest() {
  if (fs.existsSync(MANIFEST_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8"));
    } catch {
      return [];
    }
  }
  return [];
}

export function listCheckpoints() {
  const manifest = loadManifest();
  if (manifest.length === 0) {
    console.log("No saved checkpoints found in backups/code/manifest.json.");
    return [];
  }

  console.log("\n======================== AVAILABLE CHECKPOINTS ========================");
  const recent = manifest.slice(-10).reverse();
  recent.forEach((cp, idx) => {
    const dateStr = new Date(cp.timestamp).toLocaleString();
    console.log(`[${idx + 1}] ID:     ${cp.id}`);
    console.log(`    Date:   ${dateStr}`);
    console.log(`    Label:  ${cp.label || cp.type || "checkpoint"}`);
    console.log(`    Branch: ${cp.branch} (${cp.commit})`);
    console.log(`    Tag:    ${cp.tag || "N/A"}`);
    if (cp.patchFile) {
      console.log(`    Patch:  backups/code/${cp.patchFile}`);
    }
    console.log("-----------------------------------------------------------------------");
  });
  return recent;
}

export function performRollback(targetId) {
  const manifest = loadManifest();
  let target = null;

  if (!targetId || targetId === "latest") {
    target = manifest.length > 0 ? manifest[manifest.length - 1] : null;
  } else {
    target = manifest.find((cp) => cp.id === targetId || cp.tag === targetId || cp.id.includes(targetId));
  }

  if (!target) {
    console.error(`❌ Checkpoint "${targetId || "latest"}" not found.`);
    console.log("Run 'npm run rollback --list' to see available checkpoints.");
    process.exit(1);
  }

  console.log(`\n⏳ Preparing rollback to checkpoint: ${target.id} (${target.commit})...`);

  // 1. Safety stash: Shelve any current uncommitted changes
  const status = run("git status --porcelain");
  if (status) {
    const stashMsg = `safety-stash-before-rollback-${Date.now()}`;
    console.log(`📦 Uncommitted changes detected. Shelving into git stash: "${stashMsg}"`);
    run(`git stash push -u -m "${stashMsg}"`);
  }

  // 2. Checkout the tag or commit
  const checkoutRef = target.tag || target.commit;
  const result = run(`git checkout ${checkoutRef}`);

  if (result === null) {
    // If detached checkout failed, try commit hash
    run(`git checkout ${target.commit}`);
  }

  console.log("\n========================================================");
  console.log(`✅  ROLLBACK COMPLETE: Codebase restored to ${target.id}`);
  console.log(`🌿  Target: ${checkoutRef} (${new Date(target.timestamp).toLocaleString()})`);
  console.log("💡  If you want to create a new branch from here: git checkout -b feature/recovered-state");
  console.log("========================================================\n");
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--list") || args.includes("-l")) {
    listCheckpoints();
    return;
  }

  const targetArg = args[0];
  if (targetArg) {
    performRollback(targetArg);
    return;
  }

  const checkpoints = listCheckpoints();
  if (checkpoints.length === 0) return;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question("\nEnter checkpoint number (1-10) or ID to roll back, or 'q' to cancel: ", (answer) => {
    rl.close();
    const trimmed = answer.trim();
    if (!trimmed || trimmed.toLowerCase() === "q") {
      console.log("Rollback cancelled.");
      return;
    }

    const num = parseInt(trimmed, 10);
    if (!isNaN(num) && num >= 1 && num <= checkpoints.length) {
      performRollback(checkpoints[num - 1].id);
    } else {
      performRollback(trimmed);
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
