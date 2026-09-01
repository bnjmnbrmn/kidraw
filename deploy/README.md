# Development server deployment

`kidraw.dev.bnjmnbrmn.com` is proxied by nginx to the Angular development
server on `127.0.0.1:4200`. Install the systemd unit so that the Angular server
and debug-log collector start at boot and restart after a failure:

```bash
sudo install -o root -g root -m 0644 \
  deploy/kidraw.service /etc/systemd/system/kidraw.service
sudo systemctl daemon-reload
sudo systemctl enable --now kidraw.service
```

Useful checks:

```bash
sudo systemctl status kidraw.service
sudo journalctl -u kidraw.service -f
curl --fail https://kidraw.dev.bnjmnbrmn.com/
```

The unit invokes the Node binary directly. Launching it through the
Snap-provided `npm` wrapper moves the process tree to a user cgroup, which
prevents the system service from reliably stopping all of its children.

## Homepage preview

The static introduction page is available without replacing the development
app at:

<https://kidraw.dev.bnjmnbrmn.com/homepage/>

Build it, copy it into `/var/www`, install the versioned nginx virtual host,
validate nginx, and reload it with:

```bash
deploy/install-homepage.sh
```

The exact `/homepage` URL redirects to `/homepage/`. The trailing slash is
important because nginx serves the generated `index.html` from that directory.
