#!/usr/bin/env node

/**
 * Compare two bench-load JSON reports (NEU-629).
 *
 * Usage:
 *   node scripts/bench-compare.mjs benchmarks/baseline-pre-b.json benchmarks/after-b.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BENCHMARKS_DIR = path.join(path.resolve(__dirname, '..'), 'benchmarks');

const STAGES = [
  'app_mount',
  'recipes_ready',
  'chat_shell_ready',
  'recipes_route_ready',
  'recipes_first_card',
];

function readReport(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function formatMs(value) {
  return typeof value === 'number' && Number.isFinite(value) ? `${value} ms` : 'n/a';
}

function formatKb(value) {
  return typeof value === 'number' && Number.isFinite(value) ? `${value} KB` : 'n/a';
}

function delta(before, after) {
  if (typeof before !== 'number' || typeof after !== 'number') {
    return { deltaMs: null, deltaPct: null };
  }
  const deltaMs = Math.round((after - before) * 10) / 10;
  const deltaPct = before === 0 ? null : Math.round(((after - before) / before) * 1000) / 10;
  return { deltaMs, deltaPct };
}

function main() {
  const [beforePathArg, afterPathArg] = process.argv.slice(2);
  if (!beforePathArg || !afterPathArg) {
    console.error('Usage: node scripts/bench-compare.mjs <before.json> <after.json>');
    process.exit(1);
  }

  const beforePath = path.resolve(beforePathArg);
  const afterPath = path.resolve(afterPathArg);
  const before = readReport(beforePath);
  const after = readReport(afterPath);

  const rows = STAGES.map((stage) => {
    const beforeMs = before.median?.stages?.[stage] ?? null;
    const afterMs = after.median?.stages?.[stage] ?? null;
    const { deltaMs, deltaPct } = delta(beforeMs, afterMs);
    return { stage, beforeMs, afterMs, deltaMs, deltaPct };
  });

  const beforeKb = before.median?.network?.recipes_list_kb ?? null;
  const afterKb = after.median?.network?.recipes_list_kb ?? null;
  const kbDelta = delta(beforeKb, afterKb);

  console.log('App load benchmark comparison');
  console.log(`  baseline: ${beforePath}`);
  console.log(`  after:    ${afterPath}`);
  console.log('');
  console.log('Stage                  Before     After      Δ          Δ%');
  for (const row of rows) {
    const beforeLabel = formatMs(row.beforeMs).padStart(10);
    const afterLabel = formatMs(row.afterMs).padStart(10);
    const deltaLabel = row.deltaMs == null ? 'n/a'.padStart(10) : `${row.deltaMs} ms`.padStart(10);
    const pctLabel = row.deltaPct == null ? 'n/a' : `${row.deltaPct}%`;
    console.log(
      `${row.stage.padEnd(22)} ${beforeLabel} ${afterLabel} ${deltaLabel} ${pctLabel}`,
    );
  }

  console.log('');
  console.log(`recipes_list_kb        ${formatKb(beforeKb).padStart(10)} ${formatKb(afterKb).padStart(10)} ${
    kbDelta.deltaMs == null ? 'n/a'.padStart(10) : `${kbDelta.deltaMs} KB`.padStart(10)
  } ${kbDelta.deltaPct == null ? 'n/a' : `${kbDelta.deltaPct}%`}`);

  const compareOut = {
    generatedAt: new Date().toISOString(),
    baseline: beforePath,
    after: afterPath,
    stages: rows,
    network: {
      recipes_list_kb: {
        before: beforeKb,
        after: afterKb,
        deltaKb: kbDelta.deltaMs,
        deltaPct: kbDelta.deltaPct,
      },
    },
  };

  const outName = `compare-${path.basename(beforePath, '.json')}-vs-${path.basename(afterPath, '.json')}.json`;
  const outPath = path.join(BENCHMARKS_DIR, outName);
  fs.mkdirSync(BENCHMARKS_DIR, { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(compareOut, null, 2)}\n`);
  console.log('');
  console.log(`Wrote ${outPath}`);
}

main();
