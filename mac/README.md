mac kit

opt-in | a Mac's screen, windows, workspaces and apps on the page | phone-first

what it is
- screen/ noVNC over Screen Sharing | trackpad pad, left middle right buttons, scroll strip | displays stacked upright | double-tap full screen | title: rtt fps KB/s MB | drops the session 20 s out of sight | under it: render density, full data or data saver, float split stack max, send to screen ◂ ▸, focus ⇆
- windows/ every workspace as a chip, active and inactive | tap switches | every window grouped by workspace | focus, move, main, close
- apps/ every `.app` as an icon | running bright, stopped dim | most used first | tap picks, `open` in the title starts it | picked running app: send its windows to a workspace, bring forward, quit, force quit

needs
- the Mac on a tailnet | the agent is reached at `https://<mac>.<tailnet>.ts.net/mac`
- aerospace window manager | windows, workspaces and send use it
- Screen Sharing on, with a legacy VNC password | System Settings, Sharing, Screen Sharing, (i), VNC viewers may control screen with password
- the docker box on the same tailnet | the relay reaches the Mac's port 5900 over it

files
- agent/ Mac side | python 3 stdlib | `--selftest`
- agent.plist/ launchd template for the agent
- relay/ logs in to Screen Sharing, hands noVNC a session with no prompt | forwards only tiles that changed | data saver: fewer frames, busy areas as JPEG | needs `cryptography numpy pillow`, so does `--selftest`
- compose.yml/ override | adds `novnc` + `relay`, mounts the nginx config and `web/`
- nginx.conf/ page + `/mac/` + the `/vnc/vnc` websocket
- get-novnc/ fetches noVNC `v1.6.0` into `web/novnc`
- mac.html/ the partial | screen, windows and apps cards
- web/ `mac.js` `mac.css` | served at `/mac/`

Mac
```sh
cp mac/agent.plist ~/Library/LaunchAgents/atlas.mac-agent.plist
$EDITOR ~/Library/LaunchAgents/atlas.mac-agent.plist   # PATH_TO, ATLAS_ORIGINS = the page's https origin
launchctl load ~/Library/LaunchAgents/atlas.mac-agent.plist
tailscale serve --bg --set-path=/mac http://127.0.0.1:8765
python3 mac/agent --selftest
curl -s https://<mac>.<tailnet>.ts.net/mac/windows | head -c 200
```

docker box
```sh
./mac/get-novnc
printf '%s' 'the-vnc-password' > mac/password && chmod 600 mac/password
cp mac/mac.html templates/sections/      # set data-mac-agent to the Mac's /mac url
$EDITOR templates/sections.manifest      # add `mac.html` under a section
MAC_HOST=<mac>.<tailnet>.ts.net docker compose -f compose.yml -f mac/compose.yml up -d
docker compose -f compose.yml -f mac/compose.yml logs relay   # "upstream rejected" = wrong password
```

gotchas
- no auth on the agent | anyone on the tailnet can move and close windows | never publish it with `tailscale funnel`
- the agent binds `127.0.0.1` | `tailscale serve` is the only way in
- `ATLAS_ORIGINS` must match the page's origin exactly | wrong origin = cards read offline | other origins' POSTs get 403
- `mac/password` and `web/novnc/` are gitignored | the password never reaches the page or a url
- the relay offers no password to the browser | whoever reaches the page drives the Mac | keep the page tailnet-only
- the screen socket refuses an Origin whose host is not the request's Host | a proxy in front must pass Host through
- Screen Sharing offers legacy auth only with the VNC password set | without it the relay logs "no legacy VNC auth"
- MagicDNS names may not resolve inside containers | use the Mac's `100.x` address for `MAC_HOST` if the relay cannot find it
- `mac.html` is the one partial carrying `<script>` and `<link>` | the kit stays out of `app.js`
- displays come from the agent's `/displays` | until it answers, the framebuffer is one screen
- pad gain, accel and tap timing are knobs at the top of the viewer in `mac.js` | tune on the phone
- usage counts in `~/Library/Application Support/atlas-mac-agent/use.json` | a minute per minute focused, skipped after 2 min idle
