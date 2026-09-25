atlas

one-page machine map | tabs | search | pinned iframe rail | tiles | per-device prefs

what it is
- `bin/atlas-build` builds `templates/` into one self-contained `build/index.html` | css + js inlined | python 3 stdlib only
- served by any static host | icons + webmanifest pushed beside it | installs as a home-screen app on iOS

build
```sh
./bin/atlas-build             # build/index.html, no side effects
ATLAS_DEST=web:/srv/www/atlas ./bin/atlas-build --push    # scp page + assets
ATLAS_DEST=web:/srv/www/atlas ./bin/atlas-build --check   # served copy vs build, date aside | exit 1 = drift
./bin/atlas-build --selftest  # prose collapse + date compare + manifest parse
```

layout
| path | what |
|---|---|
| `templates/base.html` | shell: rail, tabs, search, modals — `{{DATE}}` `{{NAV}}` `{{SECTIONS}}` `{{NSEC}}` `{{STYLE}}` `{{SCRIPT}}` |
| `templates/app.css` | inlined at `{{STYLE}}` |
| `templates/app.js` | inlined at `{{SCRIPT}}` |
| `templates/sections.manifest` | section order + tab labels | first section is the homepage |
| `templates/sections/*.html` | card partials | markup only, no `<script>` or `<style>` |
| `assets/` | `manifest.webmanifest` `icon-*-v2.png` | pushed verbatim beside the page |

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
- `--check` ignores the header date stamp | the build writes today's date, an unchanged page still differs by that line
- sites sending `X-Frame-Options` or `frame-ancestors` refuse the iframe | use the tab's `open ↗`
- icon names carry `-v2` | iOS caches touch icons hard, rename to force a refresh
