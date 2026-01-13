#!/bin/bash
cd /Users/anibal.abarca/Development/Neuforce/jamie-oliver-ai
echo "=== BRANCH ===" > git-status.txt
git branch --show-current >> git-status.txt
echo "" >> git-status.txt
echo "=== STATUS ===" >> git-status.txt
git status --short >> git-status.txt
echo "" >> git-status.txt
echo "=== UNCOMMITTED ===" >> git-status.txt
git diff --name-only >> git-status.txt
