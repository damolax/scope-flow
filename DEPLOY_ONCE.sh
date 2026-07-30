#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/damolax/scope-flow.git"

if [[ ! -f package.json ]]; then
  echo "ERROR: package.json was not found. Open Git Bash inside the extracted scope-flow-operations folder."
  exit 1
fi

# Local npm validation is intentionally skipped because some Windows npm 11 builds
# can terminate with "Exit handler never called!". Vercel will install and build.
rm -rf node_modules .next

git init
git branch -M main
git add .
if git diff --cached --quiet; then
  echo "No new files to commit."
else
  git -c user.name="Oyeola" -c user.email="oyekunleolalekan3168@gmail.com" commit -m "Deploy ScopeFlow 6 operations and delivery workflow"
fi

git remote remove origin 2>/dev/null || true
git remote add origin "$REPO_URL"
git push -u origin main --force

echo
echo "ScopeFlow 6 source was pushed successfully to $REPO_URL"
echo "Next: import the repository into Vercel. Vercel will install and build the dependencies."
