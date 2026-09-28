setup

steps for an agent setting atlas up as its user's dashboard | work top to bottom | ask only what the machine cannot tell you
no login on the page | anyone who can reach the port reads it | tell the user before opening it past localhost

ask the user
- hosts/ every machine to list | what each runs | its urls | its ssh name
- serving/ docker on one box (`compose.yml`, pulls `ghcr.io/solraze/atlas`) | or any static web root over scp (`ATLAS_DEST`)
- reach/ tailscale (recommend it) | wireguard | existing reverse proxy | LAN
- port/ default `8080`
- extra sections/ keybinds | config paths | anything else they want searchable

write the page
- one card per host in `templates/sections/` | copy the shape of `hosts.html` | one `<div class="card">` per host
- `<h2><span>host</span><span class="note">what it is</span></h2>` then a `<table>` of `<tr class="any"><td>name</td><td>value</td></tr>`
- every service url as an `<a href>` | the rail offers every link on the page for pinning
- same-origin links stay relative | `files/` not `https://this-box/files/`
- explainer cards get `class="card prose"` | they ship collapsed and sort last
- `templates/sections.manifest` lists sections in order | first section is the homepage
- drop example partials the user has no use for | from the manifest and from disk
- `assets/manifest.webmanifest` `name` + `short_name` | the home-screen label

check the build
```sh
python3 bin/atlas-build --selftest   # manifest parse + every partial exists + prose collapse
python3 bin/atlas-build              # build/index.html | open it in a browser to review
```
no python on the machine | skip both, the container builds the page at start

serve with docker
```sh
ATLAS_PORT=8080 docker compose up -d                  # pulls the image, binds 127.0.0.1
curl -s localhost:8080 | grep -c '<section id='       # one per manifest section
docker compose logs atlas                             # missing partials warn here | a build error stops the container
```
- template edits | `docker compose restart` | the page rebuilds from the mounted `templates/` at start
- tailscale (best) | `tailscale serve --bg 8080` | tailnet only, https, `https://<machine>.<tailnet>.ts.net`
- wireguard | port line `<wg-address>:8080:80`
- reverse proxy | drop `ports`, join the proxy's docker network, proxy to `atlas:80` | auth at the proxy if it faces more than the LAN
- LAN | port line `8080:80` | only after the user agrees the page is readable network-wide
- image update | `docker compose pull && docker compose up -d` | templates stay

serve from a static host instead
```sh
ATLAS_DEST=web:/srv/www/atlas python3 bin/atlas-build --push    # scp page + assets
ATLAS_DEST=web:/srv/www/atlas python3 bin/atlas-build --check   # exit 1 = served copy differs
```

rules
- no passwords | tokens | private keys in any partial | the page is served to anyone who can reach it
- partials are markup only | no `<script>` | no `<style>` | behaviour lives in `templates/app.js`
- never hand-edit `build/index.html` | it is regenerated on every build
- sites sending `X-Frame-Options` or `frame-ancestors` refuse the rail iframe | nothing to fix, the tab's `open ↗` opens them outside

done when
- `--selftest` passes | or the docker build succeeds
- the page loads at the chosen address and every host card is on it
- `/` search finds a service by name
