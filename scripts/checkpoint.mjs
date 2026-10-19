#!/usr/bin/env node

/**
 * Checkpoint Script
 * Creates a named on-demand safety checkpoint of the codebase.
 * Usage:
 *   npm run checkpoint "before refactoring auth"
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
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

function getTimestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = now.getFullYear();
  const mm = pad(now.getMonth() + 1);
  const dd = pad(now.getDate());
  const hh = pad(now.getHours());
  const min = pad(now.getMinutes());
  const ss = pad(now.getSeconds());
  return `${yyyy}-${mm}-${dd}_${hh}-${min}-${ss}`;
}

export function createCheckpoint(label = "") {
  const isGit = run("git rev-parse --is-inside-work-tree");
  if (isGit !== "true") {
    console.error("❌ Not a git repository.");
    process.exit(1);
  }

  if (!fs.existsSync(BACKUPS_CODE_DIR)) {
    fs.mkdirSync(BACKUPS_CODE_DIR, { recursive: true });
  }

  let manifest = [];
  if (fs.existsSync(MANIFEST_PATH)) {
    try {
      manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8"));
    } catch {
      manifest = [];
    }
  }

  const timestamp = getTimestamp();
  const cleanLabel = (label || "manual").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const checkpointId = `${timestamp}-${cleanLabel || "snapshot"}`;
  const tagName = `checkpoint/${checkpointId}`;

  const currentBranch = run("git branch --show-current") || "unknown";
  const currentCommit = run("git rev-parse --short HEAD") || "initial";
  const statusOutput = run("git status --porcelain") || "";

  // 1. Generate patch archive
  let patchFile = null;
  if (statusOutput) {
    patchFile = `patch-${checkpointId}.patch`;
    const patchPath = path.join(BACKUPS_CODE_DIR, patchFile);
    const diff = run("git diff HEAD") || "";
    const fullDiff = `# Checkpoint Snapshot: ${label || "Manual snapshot"}\n# Timestamp: ${timestamp}\n# Branch: ${currentBranch} @ ${currentCommit}\n# Status:\n${statusOutput}\n\n${diff}`;
    fs.writeFileSync(patchPath, fullDiff, "utf-8");
  }

  // 2. Create git tag
  run(`git tag -a "${tagName}" -m "${label || "Manual checkpoint at " + timestamp}"`);

  // 3. Update manifest
  const entry = {
    id: checkpointId,
    label: label || "Manual Checkpoint",
    type: "manual",
    timestamp: new Date().toISOString(),
    branch: currentBranch,
    commit: currentCommit,
    tag: tagName,
    patchFile,
    hasUncommittedChanges: Boolean(statusOutput),
  };

  manifest.push(entry);
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf-8");

  console.log("\n========================================================");
  console.log(`✅  SAFETY CHECKPOINT CREATED: ${checkpointId}`);
  console.log(`🏷️   Git Tag:  ${tagName}`);
  console.log(`🌿  Branch:   ${currentBranch} (${currentCommit})`);
  if (patchFile) {
    console.log(`📦  Patch:    backups/code/${patchFile}`);
  }
  console.log(`↩️   To roll back anytime, run: npm run rollback ${checkpointId}`);
  console.log("========================================================\n");

  return entry;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const customLabel = process.argv.slice(2).join(" ");
  createCheckpoint(customLabel);
}
