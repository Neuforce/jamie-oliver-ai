#!/usr/bin/env node

/**
 * Automated app-load benchmark (NEU-629 Phase A).
 *
 * Usage:
 *   node scripts/bench-load.mjs
 *   node scripts/bench-load.mjs --out baseline-pre-b --runs 5
 *   node scripts/bench-load.mjs --skip-build
 *
 * Requires: npm run build (unless --skip-build), playwright chromium (`npx playwright install chromium`).
 */

import { spawn } from 'child_process';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.resolve(__dirname, '..');
const BENCHMARKS_DIR = path.join(FRONTEND_ROOT, 'benchmarks');

const STAGES_FOR_MEDIAN = [
  'app_mount',
  'recipes_ready',
  'chat_shell_ready',
  'recipes_route_ready',
  'recipes_first_card',
];

function parseArgs(argv) {
  const options = {
    out: `bench-${new Date().toISOString().replace(/[:.]/g, '-')}`,
    runs: 3,
    skipBuild: false,
    port: 4173,
    timeoutMs: 90_000,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out') {
      options.out = argv[i + 1];
      i += 1;
    } else if (arg === '--runs') {
      options.runs = Number(argv[i + 1]);
      i += 1;
    } else if (arg === '--skip-build') {
      options.skipBuild = true;
    } else if (arg === '--port') {
      options.port = Number(argv[i + 1]);
      i += 1;
    } else if (arg === '--timeout') {
      options.timeoutMs = Number(argv[i + 1]);
      i += 1;
    }
  }

  if (!Number.isFinite(options.runs) || options.runs < 1) {
    throw new Error('--runs must be a positive number');
  }

  return options;
}

function runCommand(command, args, { cwd = FRONTEND_ROOT, env = process.env, silent = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: silent ? 'pipe' : 'inherit',
      shell: false,
    });

    let stderr = '';
    if (silent && child.stderr) {
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
    }

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} failed (${code}): ${stderr}`));
    });
  });
}

async function waitForServer(url, timeoutMs = 30_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(url, (res) => {
          res.resume();
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 500) {
            resolve();
          } else {
            reject(new Error(`status ${res.statusCode}`));
          }
        });
        req.on('error', reject);
        req.setTimeout(2000, () => {
          req.destroy(new Error('timeout'));
        });
      });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw new Error(`Server did not become ready: ${url}`);
}

function benchEnv() {
  return {
    ...process.env,
    VITE_ALLOW_LOCAL_RECIPES: 'true',
    VITE_SUPERTAB_CLIENT_ID: '',
    VITE_API_BASE_URL: 'http://127.0.0.1:59999',
  };
}

function stageMs(report, stage) {
  const mark = report?.stages?.find((entry) => entry.stage === stage);
  return typeof mark?.totalMs === 'number' ? mark.totalMs : null;
}

function median(values) {
  const nums = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (nums.length === 0) {
    return null;
  }
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10;
}

function createNetworkTracker() {
  return {
    recipes_list_kb: null,
    recipes_list_url: null,
  };
}

function attachNetworkTracker(page, network) {
  page.on('response', async (response) => {
    const url = response.url();
    if (!url.includes('/api/v1/recipes')) {
      return;
    }
    if (/\/api\/v1\/recipes\/[^/?]+/.test(url)) {
      return;
    }
    try {
      const body = await response.body();
      network.recipes_list_kb = Math.round((body.length / 1024) * 10) / 10;
      network.recipes_list_url = url;
    } catch {
      // Response body may be unavailable for aborted/cached requests.
    }
  });
}

async function setupPage(context) {
  const page = await context.newPage();
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (
      url.includes('getsupertab.com')
      || url.includes('getsupertab.net')
      || url.includes('supertab.co')
      || url.includes('sentry.io')
    ) {
      await route.abort();
      return;
    }
    await route.continue();
  });
  return page;
}

async function benchChatRoute(baseUrl, timeoutMs) {
  const browser = await chromium.launch({ headless: true });
  const network = createNetworkTracker();
  try {
    const context = await browser.newContext();
    const page = await setupPage(context);
    attachNetworkTracker(page, network);

    const started = Date.now();
    await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await page.waitForSelector('[data-testid="chat-shell"]', { timeout: timeoutMs });
    await page.waitForFunction(
      () => {
        const report = window.__APP_LOAD_REPORT__;
        return report?.stages?.some((s) => s.stage === 'chat_shell_ready')
          && report?.stages?.some((s) => s.stage === 'recipes_ready');
      },
      { timeout: timeoutMs },
    );

    const report = await page.evaluate(() => window.__APP_LOAD_REPORT__ ?? null);
    await context.close();
    return { report, network, navigation_ms: Date.now() - started };
  } finally {
    await browser.close();
  }
}

async function benchRecipesRoute(baseUrl, timeoutMs) {
  const browser = await chromium.launch({ headless: true });
  const network = createNetworkTracker();
  try {
    const context = await browser.newContext();
    const page = await setupPage(context);
    attachNetworkTracker(page, network);

    const started = Date.now();
    await page.goto(`${baseUrl}/recipes`, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await page.waitForSelector('[data-testid="recipes-view"]', { timeout: timeoutMs });
    await page.waitForSelector('[data-testid="recipe-card"]', { timeout: timeoutMs });
    await page.waitForFunction(
      () => window.__APP_LOAD_REPORT__?.stages?.some((s) => s.stage === 'recipes_first_card'),
      { timeout: timeoutMs },
    );

    const report = await page.evaluate(() => window.__APP_LOAD_REPORT__ ?? null);
    await context.close();
    return { report, network, navigation_ms: Date.now() - started };
  } finally {
    await browser.close();
  }
}

function mergeStageMaps(chatStages, recipesStages) {
  return {
    app_mount: chatStages.app_mount ?? recipesStages.app_mount ?? null,
    recipes_ready: chatStages.recipes_ready ?? recipesStages.recipes_ready ?? null,
    chat_shell_ready: chatStages.chat_shell_ready ?? null,
    recipes_route_ready: recipesStages.recipes_route_ready ?? null,
    recipes_first_card: recipesStages.recipes_first_card ?? null,
  };
}

async function runSingleBench(baseUrl, timeoutMs) {
  const chat = await benchChatRoute(baseUrl, timeoutMs);
  const recipes = await benchRecipesRoute(baseUrl, timeoutMs);

  const chatStages = Object.fromEntries(
    STAGES_FOR_MEDIAN.map((stage) => [stage, stageMs(chat.report, stage)]),
  );
  const recipesStages = Object.fromEntries(
    STAGES_FOR_MEDIAN.map((stage) => [stage, stageMs(recipes.report, stage)]),
  );

  const network = {
    recipes_list_kb: recipes.network.recipes_list_kb ?? chat.network.recipes_list_kb,
    recipes_list_url: recipes.network.recipes_list_url ?? chat.network.recipes_list_url,
  };

  return {
    report: {
      chat: chat.report,
      recipes: recipes.report,
    },
    network,
    timings: {
      chat_navigation_ms: chat.navigation_ms,
      recipes_navigation_ms: recipes.navigation_ms,
    },
    stages: mergeStageMaps(chatStages, recipesStages),
  };
}

function aggregateRuns(runResults, { discardFirst = true } = {}) {
  const usable = discardFirst && runResults.length > 1 ? runResults.slice(1) : runResults;

  const stageMedians = Object.fromEntries(
    STAGES_FOR_MEDIAN.map((stage) => [
      stage,
      median(usable.map((run) => run.stages[stage])),
    ]),
  );

  const recipesListKb = median(
    usable.map((run) => run.network.recipes_list_kb).filter((v) => v != null),
  );

  const recipesListUrl = usable.find((run) => run.network.recipes_list_url)?.network.recipes_list_url ?? null;

  return {
    runs: runResults.length,
    discardedColdRun: discardFirst && runResults.length > 1,
    median: {
      stages: stageMedians,
      network: {
        recipes_list_kb: recipesListKb,
        recipes_list_url: recipesListUrl,
      },
      timings: {
        chat_navigation_ms: median(usable.map((run) => run.timings.chat_navigation_ms)),
        recipes_navigation_ms: median(usable.map((run) => run.timings.recipes_navigation_ms)),
      },
    },
    runsDetail: runResults,
  };
}

async function ensureChromium() {
  try {
    const browser = await chromium.launch({ headless: true });
    await browser.close();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Playwright Chromium is not installed for this Playwright version.');
    console.error(message);
    console.error('\nRun once from apps/frontend:');
    console.error('  npm run bench:install');
    console.error('  # or: npx playwright install chromium');
    process.exit(1);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  fs.mkdirSync(BENCHMARKS_DIR, { recursive: true });

  await ensureChromium();

  if (!options.skipBuild) {
    console.log('Building frontend for bench (local recipes, no Supertab)...');
    await runCommand('npm', ['run', 'build'], { env: benchEnv(), silent: false });
  }

  const preview = spawn(
    'npx',
    ['vite', 'preview', '--host', '127.0.0.1', '--port', String(options.port), '--strictPort'],
    {
      cwd: FRONTEND_ROOT,
      env: process.env,
      stdio: 'pipe',
      shell: false,
    },
  );

  let previewLog = '';
  preview.stdout?.on('data', (chunk) => {
    previewLog += chunk.toString();
  });
  preview.stderr?.on('data', (chunk) => {
    previewLog += chunk.toString();
  });

  const baseUrl = `http://127.0.0.1:${options.port}`;

  try {
    await waitForServer(baseUrl);
    console.log(`Preview ready at ${baseUrl}`);

    const runResults = [];
    for (let i = 0; i < options.runs; i += 1) {
      console.log(`Bench run ${i + 1}/${options.runs}...`);
      runResults.push(await runSingleBench(baseUrl, options.timeoutMs));
    }

    const summary = {
      generatedAt: new Date().toISOString(),
      mode: 'local-recipes',
      baseUrl,
      ...aggregateRuns(runResults),
    };

    const outPath = path.join(BENCHMARKS_DIR, `${options.out}.json`);
    fs.writeFileSync(outPath, `${JSON.stringify(summary, null, 2)}\n`);
    console.log(`Wrote ${outPath}`);
    console.log('Median stages (ms):', summary.median.stages);
    if (summary.median.network.recipes_list_kb != null) {
      console.log('Median recipes list (KB):', summary.median.network.recipes_list_kb);
    }
  } finally {
    preview.kill('SIGTERM');
    await new Promise((resolve) => {
      preview.on('close', resolve);
      setTimeout(resolve, 2000);
    });
    if (preview.exitCode !== 0 && preview.signal !== 'SIGTERM') {
      console.error(previewLog);
    }
  }
}

main().catch((error) => {
  console.error(error.message || error);
  console.error('\nIf Playwright is missing, run: npx playwright install chromium');
  process.exit(1);
});
