#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

node "$repo_root/site/build.mjs"
sudo install -d -o root -g root -m 0755 /var/www/kidraw-homepage
sudo cp -a "$repo_root/site/dist/." /var/www/kidraw-homepage/
sudo find /var/www/kidraw-homepage -type d -exec chmod 0755 {} +
sudo find /var/www/kidraw-homepage -type f -exec chmod 0644 {} +
sudo chown -R root:root /var/www/kidraw-homepage
sudo install -o root -g root -m 0644 \
  "$repo_root/deploy/kidraw.nginx" /etc/nginx/sites-available/kidraw
sudo nginx -t
sudo systemctl reload nginx

echo "homepage: https://kidraw.dev.bnjmnbrmn.com/homepage/"
echo "capture review: https://kidraw.dev.bnjmnbrmn.com/homepage/review/"
