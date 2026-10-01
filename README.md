atlas

one-page machine map | tabs | search | pinned iframe rail | tiles | per-device prefs

what it is
- dashboard template | links, hosts, notes and keybinds as searchable cards | one static page
- `bin/atlas-build` builds `templates/` into one self-contained `index.html` | css + js inlined | python 3 stdlib only
- ships as a container `ghcr.io/solraze/atlas` | amd64 + arm64 | page rebuilt from your templates at every start
- no login | no database | no api | the page calls nothing, it only links out | `mac/` kit excepted
- installs as a home-screen app on iOS over https

template version
- static cards only | example page: two hosts, an explainer, a keybind table
- live cards — container switches, printer, metrics — need an agent on each machine and a proxy route to it | not shipped
- Mac screen, windows, workspaces, apps | opt-in kit in `mac/` | see `mac/README.md`
- hooks for them are in place: `<div class="ctl" id="…">` lists of `rowEl()` rows, `getJSON()` with a 20 s abort

security
- no login | anyone who can reach the port reads the page | it is a map of your network
- compose binds `127.0.0.1` only | open it to the LAN on purpose, never by default
- no passwords | tokens | keys in any card
- the image holds only the example page | yours stays in your mounted folder, never in an image you push

access
- best/ tailscale serve | tailnet only, real https cert, iOS installs it
  `tailscale serve --bg 8080` | page at `https://<machine>.<tailnet>.ts.net`
- wireguard/ same idea without tailscale | bind to the wireguard address instead of `127.0.0.1`
- reverse proxy/ drop `ports`, join the proxy's network, proxy to `atlas:80` | add auth at the proxy if it faces anything wider than your LAN
- LAN/ port line `"8080:80"` | plain http, readable by every device on the network

use it
```sh
git clone https://github.com/SolRaze/atlas && cd atlas
docker compose up -d            # pulls the image, serves on 127.0.0.1:8080
$EDITOR templates/sections/hosts.html templates/sections.manifest
docker compose restart          # rebuilds the page from your edits
docker compose logs atlas       # build warnings here | a build error stops the container
docker compose pull && docker compose up -d   # update the image, keep your templates
```

without cloning
```sh
mkdir atlas && cd atlas
docker run --rm ghcr.io/solraze/atlas tar -C /atlas -c templates assets | tar -x
docker run -d --name atlas --restart unless-stopped -p 127.0.0.1:8080:80 \
  -v "$PWD/templates:/atlas/templates:ro" -v "$PWD/assets:/atlas/assets:ro" ghcr.io/solraze/atlas
docker restart atlas            # after every edit
```

with an agent
point your coding agent at `setup.md` | it asks for your hosts, writes the cards, starts the container, checks the page

without docker
```sh
./bin/atlas-build             # build/index.html, no side effects
./bin/atlas-build --selftest  # prose collapse + manifest parse + every partial exists
ATLAS_DEST=web:/srv/www/atlas ./bin/atlas-build --push    # scp page + assets to any static host
ATLAS_DEST=web:/srv/www/atlas ./bin/atlas-build --check   # served copy vs build | exit 1 = drift
```

contents
| path | what |
|---|---|
| `templates/sections.manifest` | section order + tab labels | first section is the homepage |
| `templates/sections/*.html` | card partials | markup only, no `<script>` or `<style>` |
| `templates/base.html` | shell: rail, tabs, search, modals — `{{NAV}}` `{{SECTIONS}}` `{{NSEC}}` `{{STYLE}}` `{{SCRIPT}}` |
| `templates/app.css` | inlined at `{{STYLE}}` |
| `templates/app.js` | inlined at `{{SCRIPT}}` |
| `assets/` | `manifest.webmanifest` `icon-*-v2.png` | served beside the page |
| `bin/atlas-build` | templates -> `build/index.html` | `--push` `--check` `--selftest` |
| `Dockerfile` `docker-entry.sh` | nginx + python3 | builds the page at container start |
| `compose.yml` | pulls the image, mounts `templates/` + `assets/`, localhost port |
| `.github/workflows/image.yml` | `v*` tag -> multi-arch image on ghcr.io |
| `setup.md` | agent walkthrough: ask, write cards, serve, verify |
| `mac/` | opt-in Mac kit: agent, relay, viewer, compose override |

manifest
`== <id> | <tab label> | <lede>` then one partial per line

cards
- `<div class="card">` + `<h2><span>title</span><span class="note">sub</span></h2>` + a `<table>` or `<pre>`
- `.card.prose` built into a collapsed `<details>` | sorts after live cards | search opens it on a match
- `tr.any` wrapping value | `tr.sep` divider

page
- `/` search | `1`–`9` sections | `esc` clear
- rail pins any link on the page or a custom url | opens in an iframe, kept alive across switches
- first run seeds the rail with the page's links, one per host
- tiles edited in-page | url `#s=<id>` jumps to a section
- prefs hide rail | tiles | prose cards, per device in localStorage
- live lists: `<div class="ctl" id="…">` of `rowEl()` rows | prefs hides rows by `data-key`

gotchas
- rail, tiles, prefs live in each browser's localStorage | no sync between devices | clearing site data wipes them
- sites sending `X-Frame-Options` or `frame-ancestors` refuse the iframe | use the tab's `open ↗`
- an https page cannot frame plain http services | mixed content, the browser blocks it
- icon names carry `-v2` | iOS caches touch icons hard, rename to force a refresh
