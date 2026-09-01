#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

node "$repo_root/site/build.mjs"
sudo install -d -o root -g root -m 0755 /var/www/kidraw-homepage
sudo install -o root -g root -m 0644 \
  "$repo_root/site/dist/index.html" /var/www/kidraw-homepage/index.html
sudo install -o root -g root -m 0644 \
  "$repo_root/deploy/kidraw.nginx" /etc/nginx/sites-available/kidraw
sudo nginx -t
sudo systemctl reload nginx

echo "homepage: https://kidraw.dev.bnjmnbrmn.com/homepage/"
