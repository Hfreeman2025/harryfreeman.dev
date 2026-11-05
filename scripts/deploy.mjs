// npm run deploy: the public site, built, checked and deployed to Cloudflare Pages production.
//   1. installs the pinned wrangler (tools/deploy, its own lockfile) if it is not there;
//   2. refuses a working tree with uncommitted changes, so what goes out is a commit;
//   3. builds the hosted site (npm run build:hosted) and runs the gate (npm run check:predeploy);
//   4. asks wrangler who it is logged in as, and refuses unless the email is exactly the personal email
//      in site.config.json and it has exactly one account, which it prints;
//   5. creates the Pages project named in hosting.config.json, production branch main, if it is missing;
//   6. deploys dist/ to it on branch main (production) and prints the URLs.
// wrangler's telemetry is off for every call.
//
//   npm run deploy               all of it
//   npm run deploy -- --check    1, 3 and 4, and whether the project exists; creates and deploys nothing

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readHostingConfig } from '../src/hosting/config.ts';
import { allowedAccount, deploymentUrl, projectNames } from '../src/hosting/wrangler.ts';

const site = join(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const config = JSON.parse(readFileSync(join(site, 'site.config.json'), 'utf8'));
const hosting = readHostingConfig(site);
const tools = join(site, 'tools/deploy');
const wranglerBin = process.env.WRANGLER_BIN ?? join(tools, 'node_modules/.bin/wrangler');
let env = { ...process.env, WRANGLER_SEND_METRICS: 'false' };

const stop = (message) => {
  console.error(`deploy: ${message}`);
  process.exit(1);
};
const npm = (...args) => {
  const r = spawnSync('npm', args, { cwd: site, stdio: 'inherit' });
  if (r.status !== 0) stop(`npm ${args.join(' ')} failed; nothing was deployed`);
};
const wrangler = (args, { inherit = false } = {}) => {
  const r = spawnSync(wranglerBin, args, { cwd: site, env, encoding: 'utf8', stdio: inherit ? ['ignore', 'pipe', 'inherit'] : 'pipe' });
  if (inherit && r.stdout) process.stdout.write(r.stdout);
  return r;
};

if (!process.env.WRANGLER_BIN && !existsSync(wranglerBin)) {
  console.log('deploy: installing the pinned wrangler into tools/deploy');
  const r = spawnSync('npm', ['ci', '--ignore-scripts', '--no-fund', '--no-audit'], { cwd: tools, stdio: 'inherit' });
  if (r.status !== 0) stop('could not install wrangler');
}
const version = wrangler(['--version']).stdout?.trim();
console.log(`deploy: wrangler ${version}`);

const dirty = execFileSync('git', ['-C', site, 'status', '--porcelain'], { encoding: 'utf8' }).trim();
if (dirty && !check) stop('the working tree has uncommitted changes; commit them first, so what is deployed is a commit');
if (dirty) console.log('deploy: (the working tree has uncommitted changes; a real deploy would refuse)');
const commit = execFileSync('git', ['-C', site, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

npm('run', 'build:hosted');
npm('run', 'check:predeploy');

const who = wrangler(['whoami', '--json']);
let account;
try {
  account = allowedAccount(who.stdout ?? '', config.email);
} catch (error) {
  stop(error instanceof Error ? error.message : String(error));
}
console.log(`deploy: Cloudflare account “${account.name}” (${account.id}), logged in as ${account.email}`);
env = { ...env, CLOUDFLARE_ACCOUNT_ID: account.id };

const list = wrangler(['pages', 'project', 'list', '--json']);
if (list.status !== 0) stop(`could not list Pages projects: ${list.stderr}`);
const exists = projectNames(list.stdout).includes(hosting.project);
console.log(`deploy: Pages project ${hosting.project} ${exists ? 'exists' : 'does not exist yet'}`);
if (check) {
  console.log('deploy: --check: built, gated and the account checked; nothing was created or deployed');
  process.exit(0);
}

if (!exists) {
  const r = wrangler(['pages', 'project', 'create', hosting.project, '--production-branch', hosting.branch], { inherit: true });
  if (r.status !== 0) stop(`could not create ${hosting.project}`);
}
const subject = execFileSync('git', ['-C', site, 'log', '-1', '--format=%s'], { encoding: 'utf8' }).trim();
const deployed = wrangler(
  [
    'pages',
    'deploy',
    'dist',
    '--project-name',
    hosting.project,
    '--branch',
    hosting.branch,
    '--commit-hash',
    commit,
    '--commit-message',
    subject,
    '--commit-dirty=false',
  ],
  { inherit: true },
);
if (deployed.status !== 0) stop('wrangler pages deploy failed');
console.log(`deploy: ${commit.slice(0, 7)} is live on production`);
console.log(`  this deployment: ${deploymentUrl(deployed.stdout ?? '') ?? '(see wrangler’s output above)'}`);
console.log(`  production:      https://${hosting.project}.pages.dev`);
console.log(`  custom domain:   ${hosting.origin} (once attached: Pages → ${hosting.project} → Custom domains)`);
console.log(`  indexing:        ${hosting.SITE_INDEXABLE ? 'on' : 'off (noindex, nofollow; robots.txt disallows all)'}`);
