#!/usr/bin/env bun
/**
 * Release script for tagma-cli
 *
 * Usage:
 *   bun scripts/release.ts              # interactive mode, update version only
 *   bun scripts/release.ts --publish    # update version then publish to npm
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { execSync } from "child_process";
import * as readline from "readline";

// ── Utilities ─────────────────────────────────────────────────────────────────

const ROOT = resolve(import.meta.dir, "..");
const PKG_PATH = resolve(ROOT, "package.json");

function readJson(path: string): Record<string, any> {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function writeJson(path: string, data: object) {
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}

function bumpVersion(current: string, bump: string): string {
  if (/^\d+\.\d+\.\d+/.test(bump)) return bump;
  const [major, minor, patch] = current.split(".").map(Number);
  if (bump === "patch") return `${major}.${minor}.${patch + 1}`;
  if (bump === "minor") return `${major}.${minor + 1}.0`;
  if (bump === "major") return `${major + 1}.0.0`;
  throw new Error(`Invalid bump type: ${bump}`);
}

// ── Interactive prompt ────────────────────────────────────────────────────────

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q: string): Promise<string> =>
  new Promise((resolve) => rl.question(q, (ans) => resolve(ans.trim())));

const BUMP_OPTIONS = ["skip", "patch", "minor", "major", "custom"];

async function promptBump(name: string, currentVersion: string): Promise<string | null> {
  console.log(`\n  ${name}  (current: ${currentVersion})`);
  console.log("  [0] skip  [1] patch  [2] minor  [3] major  [4] custom version");
  const input = await ask("  choice> ");

  const idx = Number(input);
  if (!isNaN(idx) && idx >= 0 && idx < BUMP_OPTIONS.length) {
    const choice = BUMP_OPTIONS[idx];
    if (choice === "skip") return null;
    if (choice === "custom") {
      const ver = await ask("  enter version> ");
      return bumpVersion(currentVersion, ver);
    }
    return bumpVersion(currentVersion, choice);
  }

  if (input === "" || input === "s" || input === "skip") return null;
  try {
    return bumpVersion(currentVersion, input);
  } catch {
    console.log("  Invalid input, skipping");
    return null;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

const shouldPublish = process.argv.includes("--publish");
const pkg = readJson(PKG_PATH);

console.log("\n═══════════════════════════════════════");
console.log("  tagma-cli release tool");
console.log("═══════════════════════════════════════");
console.log(`\n  ${pkg.name}  v${pkg.version}`);

console.log("\n--- Select version bump ---");
const newVersion = await promptBump(pkg.name, pkg.version);

rl.close();

if (!newVersion) {
  console.log("\nNo update selected, exiting.");
  process.exit(0);
}

// Confirm
console.log(`\n--- Pending update ---`);
console.log(`  ${pkg.name}: ${pkg.version} → ${newVersion}`);

// Write version
pkg.version = newVersion;
writeJson(PKG_PATH, pkg);
console.log(`✓ Updated ${pkg.name}@${newVersion}`);

if (!shouldPublish) {
  console.log("\nVersion updated (not published). Add --publish to publish.");
  process.exit(0);
}

// Regenerate lockfile after version bump to avoid duplicate-key errors
console.log("\nRegenerating lockfile...");
execSync("bun install", { cwd: ROOT, stdio: "inherit" });

// Publish
console.log(`\nPublishing ${pkg.name}@${newVersion}...`);
execSync(`cd "${ROOT}" && bun publish --access public`, { stdio: "inherit" });
console.log(`✓ ${pkg.name}@${newVersion} published`);

console.log("\nAll done 🎉");
