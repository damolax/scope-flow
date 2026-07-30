#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

node <<'NODE'
const fs = require('fs');
const pkgPath = 'package.json';
const lockPath = 'package-lock.json';

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.engines = { node: '22.x' };
pkg.packageManager = 'npm@10.9.2';
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

let lockText = fs.readFileSync(lockPath, 'utf8');
lockText = lockText.replaceAll(
  'https://packages.applied-caas-gateway1.internal.api.openai.org/artifactory/api/npm/npm-public/',
  'https://registry.npmjs.org/'
);
const lock = JSON.parse(lockText);
if (lock.packages && lock.packages['']) {
  lock.packages[''].engines = { node: '22.x' };
}
fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
NODE

cat > .npmrc <<'NPMRC'
registry=https://registry.npmjs.org/
package-lock=true
audit=false
fund=false
NPMRC

cat > vercel.json <<'VERCEL'
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "installCommand": "npm ci --registry=https://registry.npmjs.org --no-audit --no-fund",
  "buildCommand": "npm run build"
}
VERCEL

if grep -q 'packages.applied-caas-gateway1.internal.api.openai.org' package-lock.json; then
  echo "ERROR: private registry URLs still exist in package-lock.json"
  exit 1
fi

git add package.json package-lock.json .npmrc vercel.json FIX_VERCEL_INSTALL.sh
git commit -m "Fix Vercel dependency installation" || true
git push origin main

echo
echo "Fix pushed. Redeploy in Vercel without the previous build cache."
