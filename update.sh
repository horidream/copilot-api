#!/bin/sh
set -eu

cd "$(dirname "$0")"

git fetch origin
git rebase origin/dev
