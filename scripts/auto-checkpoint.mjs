#!/usr/bin/env node

/**
 * Auto-Checkpoint Script
 * Runs automatically prior to 'next dev'.
 * Checks for uncommitted changes or recent work and creates a safety snapshot
 * (git tag + local diff patch archive) without interrupting developer flow.
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

export function autoCheckpoint() {
  // Ensure we are inside a git repository
  const isGit = run("git rev-parse --is-inside-work-tree");
  if (isGit !== "true") {
    return;
  }

  // Ensure backups/code directory exists
  if (!fs.existsSync(BACKUPS_CODE_DIR)) {
    fs.mkdirSync(BACKUPS_CODE_DIR, { recursive: true });
  }

  // Load manifest
  let manifest = [];
  if (fs.existsSync(MANIFEST_PATH)) {
    try {
      manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8"));
    } catch {
      manifest = [];
    }
  }

  // Check git status
  const statusOutput = run("git status --porcelain") || "";
  const currentBranch = run("git branch --show-current") || "unknown";
  const currentCommit = run("git rev-parse --short HEAD") || "initial";

  const lastCheckpoint = manifest.length > 0 ? manifest[manifest.length - 1] : null;
  const nowMs = Date.now();
  const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
  const timeSinceLast = lastCheckpoint ? nowMs - new Date(lastCheckpoint.timestamp).getTime() : Infinity;

  // If working tree is clean and last checkpoint was less than 2 hours ago, skip
  if (!statusOutput && timeSinceLast < TWO_HOURS_MS) {
    console.log(`🛡️  [Backup] Codebase clean (last checkpoint: ${lastCheckpoint.id}).`);
    return;
  }

  const timestamp = getTimestamp();
  const checkpointId = `auto-${timestamp}`;
  const tagName = `checkpoint/${checkpointId}`;

  // 1. Generate patch archive if there are uncommitted changes
  let patchFile = null;
  if (statusOutput) {
    patchFile = `patch-${checkpointId}.patch`;
    const patchPath = path.join(BACKUPS_CODE_DIR, patchFile);
    const diff = run("git diff HEAD") || "";
    // Also include untracked status header
    const fullDiff = `# Uncommitted Changes Snapshot - ${timestamp}\n# Branch: ${currentBranch} @ ${currentCommit}\n# Status:\n${statusOutput}\n\n${diff}`;
    fs.writeFileSync(patchPath, fullDiff, "utf-8");
  }

  // 2. Create git safety tag
  run(`git tag -a "${tagName}" -m "Auto-checkpoint at ${timestamp} on branch ${currentBranch}"`);

  // 3. Update manifest
  const entry = {
    id: checkpointId,
    type: "auto",
    timestamp: new Date().toISOString(),
    branch: currentBranch,
    commit: currentCommit,
    tag: tagName,
    patchFile,
    hasUncommittedChanges: Boolean(statusOutput),
  };

  manifest.push(entry);

  // Retain last 50 checkpoints
  if (manifest.length > 50) {
    const toRemove = manifest.slice(0, manifest.length - 50);
    manifest = manifest.slice(-50);
    for (const old of toRemove) {
      if (old.patchFile) {
        const oldPatch = path.join(BACKUPS_CODE_DIR, old.patchFile);
        if (fs.existsSync(oldPatch)) {
          fs.unlinkSync(oldPatch);
        }
      }
      if (old.tag) {
        run(`git tag -d "${old.tag}"`);
      }
    }
  }

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf-8");

  console.log(`🛡️  [Backup] Auto-checkpoint created: ${checkpointId} (tag: ${tagName})`);
  if (patchFile) {
    console.log(`🛡️  [Backup] Uncommitted work safely archived to: backups/code/${patchFile}`);
  }
}

// Execute if run directly from CLI
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  autoCheckpoint();
}
