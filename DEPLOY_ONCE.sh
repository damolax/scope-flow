#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/damolax/scope-flow.git"
SOURCE_DIR="$(pwd)"
DEPLOY_DIR="$HOME/scope-flow-polish-deploy"

if [[ ! -f "$SOURCE_DIR/package.json" ]]; then
  echo "ERROR: package.json was not found. Open Git Bash inside the extracted scope-flow-polish folder."
  exit 1
fi

rm -rf "$DEPLOY_DIR"
git clone "$REPO_URL" "$DEPLOY_DIR"
cd "$DEPLOY_DIR"

git checkout main 2>/dev/null || git checkout -b main
find . -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +

(
  cd "$SOURCE_DIR"
  tar --exclude='.git' --exclude='node_modules' --exclude='.next' -cf - .
) | tar -xf -

rm -rf node_modules .next
git add -A

if git diff --cached --quiet; then
  echo "No new ScopeFlow changes were found."
else
  git -c user.name="Oyeola" \
      -c user.email="oyekunleolalekan3168@gmail.com" \
      commit -m "Deploy ScopeFlow 6.1 polish and account controls"
  git push origin main
fi

echo
echo "ScopeFlow 6.1 was pushed successfully to $REPO_URL"
echo "Vercel should start a new deployment automatically."
