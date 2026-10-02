/* mac kit — the Mac's screen, windows and apps, from mac/agent and mac/relay.

   Loaded by sections/mac.html, after the page's own script: rowEl, getJSON,
   giveUp, lsGet and lsSet are app.js globals. The agent's address is the
   data-mac-agent attribute on the screen card. The agent is a tailnet-only
   endpoint on the Mac, fetched cross-origin; a device off the tailnet gets no
   answer, which the cards show as offline. */
(function () {
  var host = document.querySelector('[data-mac-agent]');
  if (!host) return;
  var AGENT = host.dataset.macAgent.replace(/\/$/, '');

  // A row tapped as a whole; an inner .ctl-btn keeps its own tap.
  function tapRow(row, fn) {
    row.tabIndex = 0;
    row.addEventListener('click', function (e) { if (!e.target.closest('.ctl-btn, a')) fn(); });
    row.addEventListener('keydown', function (e) {
      if (e.target === row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); fn(); }
    });
  }
  function btnEl(text, fn) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'ctl-btn';
    b.textContent = text;
    b.addEventListener('click', fn);
    return b;
  }
  // The row greys out while the POST runs; a failure un-greys it and says so.
  function post(url, row, done) {
    if (row) row.classList.add('busy');
    fetch(url, { method: 'POST', signal: giveUp() })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return done(r); })
      .catch(function () {
        if (!row) return;
        row.classList.remove('busy');
        row.querySelector('.v').textContent = 'no answer';
      });
  }
  // Re-read when the tab comes back, but not on every glance.
  function onReturn(fn, getLast) {
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && Date.now() - getLast() > 15000) fn();
    });
  }

  /* ---- apps: the Applications folders as icons ----
     A bright icon is a running app, a dim one is not. Most used sorts first
     — minutes it held focus, counted by the agent — then running ones; the
     letters under a running one are the workspaces its windows are on. A tap
     opens a stopped app. A tap on a running one picks it, and the chips under
     the grid send its windows to another workspace. */
  var CARDS = {
    windows: '<h2><span>windows</span><span class="note">on the mac</span></h2>' +
      '<div class="spaces"></div><div class="ctl pills"><p class="lede pad">reaching the mac…</p></div>',
    apps: '<h2><span>apps</span><span class="note">on the mac</span></h2>' +
      '<div class="appq"><input type="search" placeholder="search apps" aria-label="search apps"' +
      ' autocomplete="off" spellcheck="false"></div>' +
      '<div class="apps"></div><div class="app-send" hidden></div>'
  };

  function appsCard(card) {
    var q = card.querySelector('.appq input');
    var box = card.querySelector('.apps');
    var note = card.querySelector('h2 .note');
    var send = card.querySelector('.app-send');
    var apps = [], spaces = [], picked = '';

    function key(ws) {
      var w = spaces.filter(function (x) { return x.w === ws; })[0];
      return w ? w.k : ws;
    }

    function draw() {
      var t = q.value.trim().toLowerCase();
      box.innerHTML = '';
      apps.filter(function (a) { return a.n.toLowerCase().indexOf(t) >= 0; })
        .sort(function (a, b) { return b.use - a.use || b.on - a.on; })
        .forEach(function (a) {
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'appb' + (a.on ? ' on' : '') + (a.n === picked ? ' sel' : '');
          b.innerHTML = '<img alt="" loading="lazy"><b></b><i></i>';
          b.querySelector('img').src = AGENT + '/icon?app=' + encodeURIComponent(a.n);
          b.querySelector('b').textContent = a.n;
          b.querySelector('i').textContent = a.ws.map(key).join(' ');
          b.title = a.n + (a.on ? ' · running' + (a.ws.length ? ' on ' + a.ws.join(', ') : '') : ' · tap to open');
          b.addEventListener('click', function () {
            if (!a.on) return open(a.n, b);
            picked = picked === a.n ? '' : a.n;
            draw();
          });
          box.appendChild(b);
        });
      drawSend();
      var n = apps.filter(function (a) { return a.on; }).length;
      note.innerHTML = n + ' of ' + apps.length + ' running' +
        ' <button class="re" type="button" title="re-read running apps">refresh</button>';
    }

    function drawSend() {
      var a = apps.filter(function (x) { return x.n === picked && x.on; })[0];
      send.innerHTML = '';
      send.hidden = !a;
      if (!a) return;
      var h = document.createElement('div');
      h.className = 'ctl-head';
      h.textContent = 'send ' + a.n + ' to';
      send.appendChild(h);
      var row = document.createElement('div');
      row.className = 'spaces';
      spaces.forEach(function (w) {
        var c = document.createElement('button');
        c.type = 'button';
        c.className = 'sp' + (a.ws.indexOf(w.w) >= 0 ? ' on' : '');
        c.title = w.w;
        c.innerHTML = '<b></b><span></span>';
        c.querySelector('b').textContent = w.k;
        c.querySelector('span').textContent = w.w;
        c.addEventListener('click', function () {
          row.style.opacity = '.45';
          fetch(AGENT + '/send?app=' + encodeURIComponent(a.n) + '&ws=' + encodeURIComponent(w.w),
                { method: 'POST', signal: giveUp() })
            .then(function (r) { if (!r.ok) throw new Error(r.status); return load(); })
            .catch(function () { row.style.opacity = ''; });
        });
        row.appendChild(c);
      });
      var f = document.createElement('button');
      f.type = 'button';
      f.className = 'sp';
      f.innerHTML = '<b>↑</b><span>bring forward</span>';
      f.addEventListener('click', function () { open(a.n, f); });
      row.appendChild(f);
      send.appendChild(row);
    }

    function open(n, b) {
      b.classList.add('busy');
      fetch(AGENT + '/open?app=' + encodeURIComponent(n), { method: 'POST', signal: giveUp() })
        .then(function (r) { if (!r.ok) throw new Error(r.status); })
        // an app takes a moment to exist in `ps`; read twice
        .then(function () { setTimeout(load, 1200); setTimeout(load, 4000); })
        .catch(function () { b.classList.remove('busy'); note.textContent = n + ' — no answer'; });
    }

    function load() {
      return getJSON(AGENT + '/apps')
        .then(function (d) { apps = d.apps; spaces = d.spaces || []; draw(); })
        .catch(function () { note.textContent = 'offline'; });
    }

    q.addEventListener('input', draw);
    q.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var first = box.querySelector('.appb');
      if (first) first.click();
    });
    note.addEventListener('click', function (e) { if (e.target.closest('.re')) load(); });
    onReturn(load, function () { return 0; });
    load();
  }

  /* ---- windows: workspaces and their windows ----
     Chips are every workspace, in two rows: active holds a window, inactive
     is empty. Focused is lit, on screen is outlined, the count is its
     windows; a tap switches to one. Under them every window, grouped by
     workspace, on-screen groups first, the focused window lit. A row tap
     focuses the window; `move` arms the chips so the next chip tapped takes
     the window there; `main` moves it to the main display's visible
     workspace; `close` closes it. */
  function windowsCard(card) {
    var chips = card.querySelector('.spaces');
    var list = card.querySelector('.pills');
    var note = card.querySelector('h2 .note');
    var last = 0, moving = null, data = null;

    function act(path, row) { post(AGENT + path, row, reread); }
    function space(w) {
      chips.style.opacity = '.45';
      fetch(AGENT + '/space/' + encodeURIComponent(w), { method: 'POST', signal: giveUp() })
        .then(reread, function () { chips.style.opacity = ''; });
    }
    function arm(w) {
      moving = moving && moving.id === w.id ? null : w;
      draw(data);
    }

    function draw(d) {
      data = d;
      var sp = d.spaces || { list: [], focused: '' };
      var by = {}, order = [];
      d.windows.forEach(function (w) {
        if (!by[w.ws]) { by[w.ws] = []; order.push(w.ws); }
        by[w.ws].push(w);
      });
      var key = {};
      sp.list.forEach(function (x, i) { key[x.w] = x; x.i = i; });
      order.sort(function (a, b) {
        return (by[b][0].shown - by[a][0].shown) ||
          ((key[a] ? key[a].i : 99) - (key[b] ? key[b].i : 99));
      });
      if (moving && !d.windows.some(function (w) { return w.id === moving.id; })) moving = null;
      card.classList.toggle('moving', !!moving);

      chips.innerHTML = '';
      chips.style.opacity = '';
      [['active', true], ['inactive', false]].forEach(function (g) {
        var some = sp.list.filter(function (x) { return !!by[x.w] === g[1]; });
        if (!some.length) return;
        var l = document.createElement('div');
        l.className = 'sp-lbl';
        l.textContent = g[0] + ' · ' + some.length;
        chips.appendChild(l);
        some.forEach(chip);
      });

      function chip(x) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'sp' + (x.w === sp.focused ? ' on' : '') + (by[x.w] ? '' : ' idle') +
          ((sp.shown || []).indexOf(x.w) >= 0 ? ' shown' : '');
        b.title = moving ? 'move ' + moving.app + ' to ' + x.w : x.w;
        b.innerHTML = '<b></b><span></span>' + (by[x.w] ? '<i></i>' : '');
        b.querySelector('b').textContent = x.k;
        b.querySelector('span').textContent = x.w;
        if (by[x.w]) b.querySelector('i').textContent = by[x.w].length;
        b.addEventListener('click', function () {
          if (!moving) return space(x.w);
          var id = moving.id;
          moving = null;
          act('/move?id=' + id + '&ws=' + encodeURIComponent(x.w), list.querySelector('.picked'));
        });
        chips.appendChild(b);
      }

      list.innerHTML = '';
      order.forEach(function (ws) {
        var h = document.createElement('div');
        h.className = 'ctl-head tap';
        h.textContent = (key[ws] ? key[ws].k + ' · ' : '') + ws +
          (by[ws][0].shown ? ' · on screen' : '');
        h.title = 'switch to ' + ws;
        h.addEventListener('click', function () { space(ws); });
        list.appendChild(h);
        by[ws].forEach(function (w) {
          var row = rowEl(w.app, w.title !== w.app ? w.title : '', '');
          row.dataset.id = w.id;
          row.classList.add('tap');
          row.classList.toggle('on', w.id === d.focused);
          row.classList.toggle('picked', !!moving && moving.id === w.id);
          row.title = 'focus ' + w.app;
          tapRow(row, function () { act('/focus?id=' + w.id, row); });
          row.appendChild(btnEl(moving && moving.id === w.id ? 'cancel' : 'move',
            function () { arm(w); }));
          row.appendChild(btnEl('main', function () { act('/tomain?id=' + w.id, row); }));
          row.appendChild(btnEl('close', function () { act('/close?id=' + w.id, row); }));
          list.appendChild(row);
        });
      });
      note.innerHTML = moving ? 'tap a workspace' :
        d.windows.length + ' open <button class="re" type="button" title="re-read windows">refresh</button>';
      last = Date.now();
    }

    function reread() { setTimeout(load, 300); }
    function load() {
      return getJSON(AGENT + '/windows').then(draw)
        .catch(function () {
          list.innerHTML = '<p class="lede pad">mac unreachable — asleep, the agent is not ' +
            'loaded, or this device is off the tailnet.</p>';
          note.textContent = 'offline';
          chips.style.opacity = '';
        });
    }

    note.addEventListener('click', function (e) { if (e.target.closest('.re')) load(); });
    onReturn(load, function () { return last; });
    load();
  }

  [].forEach.call(document.querySelectorAll('.card[data-mac]:empty'), function (c) {
    c.innerHTML = CARDS[c.dataset.mac];
    (c.dataset.mac === 'apps' ? appsCard : windowsCard)(c);
  });

  /* ---- screen: noVNC, displays stacked in portrait ----
     The switch in the card's title connects; off, there is no session.

     Screen Sharing sends every display as one framebuffer, side by side,
     which is an unreadable strip on a phone held upright. Once noVNC is
     connected and the screen is portrait, or one screen or window is picked,
     its iframe stays underneath at opacity 0 — still decoding, still holding
     the session — and each display shown is copied out of its canvas into a
     canvas of its own: left-to-right becomes top-to-bottom. Where each
     display sits comes from the agent's /displays, scaled to the
     framebuffer; without an answer the framebuffer is one screen. A touch on
     a stacked display is mapped back to framebuffer coordinates and replayed
     on noVNC's canvas as mouse events; noVNC reads pointer position from
     getBoundingClientRect, so the replay lands exactly where the finger did.

     Double-tap toggles a fixed overlay rather than the Fullscreen API:
     iPhone Safari only grants fullscreen to <video>.

     The pad under the view is a laptop trackpad: a drag moves the pointer
     from where it is, a tap left-clicks, two fingers tap right-click or drag
     to scroll, three fingers tap middle-click, tap-then-drag holds the
     button. The strip at its right is the scroll wheel. The three buttons
     under it are the trackpad's physical buttons: held while a finger moves
     on the pad, left drags. A tap clicks only after TAP_MS, so a touch inside
     that window becomes a held button, not a double-click. Screen Sharing
     leaves the cursor out of the framebuffer and touch devices draw none, so
     a dot drawn over the view stands in for it at the last position sent.

     Render: the stacked displays are drawn at the Mac's own pixels (full),
     this window's device pixel ratio (auto) or a fixed 1x or 2x of their CSS
     size, never past the Mac's pixels; auto is the default. A copy runs when
     noVNC draws a frame — its canvas context is wrapped to read the damaged
     rect — so a still screen costs no copies and a cursor blink copies a
     cursor, not a display. */
  var VIEWER = 'mac/novnc/vnc.html?path=%2Fvnc%2Fvnc&autoconnect=true&resize=scale&reconnect=true';
  var WIN_POLL_MS = 2000;
  // CHECK_MS paces the layout and cursor checks; frames copy on noVNC's draws
  var TAP_MS = 300, TAP_PX = 30, CHECK_MS = 100;
  // pad: framebuffer px per finger px, times finger speed up to PAD_ACCEL.
  // Calibration knobs, tune on the phone.
  var PAD_GAIN = 2.5, PAD_ACCEL = 3, PAD_TAP_PX = 10, SCROLL_PX = 12;
  // per device: 'full' | 'auto' | 1 | 2, 'all' | a display name, on | off
  var RENDER = 'atlas.mac.render', SCREEN = 'atlas.mac.screen', ON = 'atlas.mac.on';

  // /displays (points, main display at 0,0) as framebuffer rects. geo maps a
  // point to the framebuffer: (x - x0) * k. null when the displays do not
  // add up to this framebuffer — a display came or went since the read.
  function toLayout(ds, s) {
    if (!ds || !ds.length) return null;
    var x0 = Math.min.apply(null, ds.map(function (d) { return d.x; }));
    var y0 = Math.min.apply(null, ds.map(function (d) { return d.y; }));
    var x1 = Math.max.apply(null, ds.map(function (d) { return d.x + d.w; }));
    var y1 = Math.max.apply(null, ds.map(function (d) { return d.y + d.h; }));
    var k = s.width / (x1 - x0);
    if (Math.abs((y1 - y0) * k - s.height) > 2) return null;
    var seen = {};
    return { geo: { x0: x0, y0: y0, k: k }, rects: ds.map(function (d) {
      var name = d.name, n = 2;
      while (seen[name]) name = d.name + ' ' + n++;
      seen[name] = 1;
      return { name: name, x: Math.round((d.x - x0) * k), y: Math.round((d.y - y0) * k),
               w: Math.round(d.w * k), h: Math.round(d.h * k) };
    }) };
  }

  // Builds a viewer at the end of host.
  function mount(host) {
    var box = document.createElement('div');
    box.className = 'vnc';
    var f = document.createElement('iframe');
    f.src = VIEWER;
    f.setAttribute('allow', 'clipboard-read; clipboard-write');
    var stack = document.createElement('div');
    stack.className = 'vnc-stack';
    var row = document.createElement('div');
    row.className = 'vnc-padrow';
    var pad = document.createElement('div');
    pad.className = 'vnc-pad';
    var vs = document.createElement('div');
    vs.className = 'vnc-vscroll';
    vs.innerHTML = '<span>scroll</span>';
    row.appendChild(pad);
    row.appendChild(vs);
    var btns = document.createElement('div');
    btns.className = 'vnc-btns';
    btns.innerHTML = '<button type="button" data-b="0">left</button>' +
      '<button type="button" data-b="1">middle</button>' +
      '<button type="button" data-b="2">right</button>';
    var dot = document.createElement('div');
    dot.className = 'vnc-dot';
    box.appendChild(f);
    box.appendChild(stack);
    box.appendChild(row);
    box.appendChild(btns);
    box.appendChild(dot);
    host.appendChild(box);

    // pos: last pointer position sent to the Mac, framebuffer coordinates
    // dirty: what noVNC drew since the last copy — false, true for all of
    // it, or a {l,t,r,b} rect in framebuffer pixels. seen: framebuffer size last read
    var views = [], shown = '', seen = null, lastCheck = 0, lastTap = null, pos = null, dirty = false;
    var layout = [], geo = null;

    box.onlayout = null;     // (layout) on every framebuffer size change
    box.win = null;          // a window's frame in points: shown alone, cropped
    box.rerender = function () { if (views.length) size(); };
    box.reload = function () { unstack(); seen = null; f.src = VIEWER; };
    box.full = full;
    // noVNC's own touch keyboard: its button focuses a textarea in the frame
    box.keyboard = function () {
      var d = f.contentDocument, k = d && (d.getElementById('noVNC_keyboard_button') ||
                                           d.getElementById('noVNC_keyboardinput'));
      if (!k) return;
      if (k.tagName === 'TEXTAREA') k.focus(); else k.click();
      setTimeout(function () { box.scrollLeft = 0; }, 50);
    };

    function canvas() {
      var d = f.contentDocument;
      return d && d.querySelector('#noVNC_container canvas');
    }
    function connected() {
      var d = f.contentDocument;
      return !!d && d.documentElement.classList.contains('noVNC_connected');
    }
    function full(on) {
      box.classList.toggle('full', on);
      sideways();
      if (views.length) size();
    }
    // Full screen held sideways: the scroll strip, pad and buttons are a
    // column at the right and the screen takes the whole height.
    function sideways() {
      box.classList.toggle('side', box.classList.contains('full') && innerWidth > innerHeight);
    }
    // height the view and its pad may take
    function room() {
      if (box.classList.contains('full')) return box.clientHeight - inset('Top') - inset('Bottom');
      return innerHeight - 24;
    }
    // what the controls take from the screen's height and width
    function under() {
      return box.classList.contains('side') ? 0 : row.offsetHeight + btns.offsetHeight;
    }
    function across() {
      var w = box.clientWidth - inset('Left') - inset('Right');
      return box.classList.contains('side') ? w - row.offsetWidth : w;
    }
    // full screen's safe-area padding on one side, in px
    function inset(side) { return parseFloat(getComputedStyle(box)['padding' + side]) || 0; }
    function isDoubleTap(p) {
      var t = Date.now(), hit = lastTap && t - lastTap.t < TAP_MS &&
        Math.abs(p.clientX - lastTap.x) < TAP_PX && Math.abs(p.clientY - lastTap.y) < TAP_PX;
      lastTap = hit ? null : { t: t, x: p.clientX, y: p.clientY };
      return hit;
    }

    // Sends a pointer event at framebuffer (fx, fy) through noVNC's canvas.
    // extra carries button for a click, deltaX/deltaY for a wheel.
    function send(type, fx, fy, buttons, extra) {
      var s = canvas();
      if (!s || !s.width) return;
      pos = { x: Math.max(0, Math.min(s.width - 1, fx)), y: Math.max(0, Math.min(s.height - 1, fy)) };
      var sb = s.getBoundingClientRect(), w = f.contentWindow;
      var init = Object.assign({
        bubbles: true, cancelable: true, button: 0, buttons: buttons,
        clientX: sb.left + pos.x * sb.width / s.width,
        clientY: sb.top + pos.y * sb.height / s.height
      }, extra);
      s.dispatchEvent(type === 'wheel' ? new w.WheelEvent(type, init) : new w.MouseEvent(type, init));
      place();
    }

    // Replays a point on a stacked display as a mouse event on noVNC's canvas.
    function replay(type, v, p, buttons) {
      var rc = v.c.getBoundingClientRect();
      send(type, v.r.x + (p.clientX - rc.left) * v.r.w / rc.width,
        v.r.y + (p.clientY - rc.top) * v.r.h / rc.height, buttons);
    }

    // Moves the cursor dot to pos, over the stacked display or the plain
    // viewer. Off every shown display (a hidden screen) it goes away.
    function place() {
      var s = canvas();
      if (!pos || !s || !s.width) return;
      var x, y, r;
      if (views.length) {
        var v = views.filter(function (v) { return pos.x >= v.r.x && pos.x < v.r.x + v.r.w; })[0];
        if (!v) { dot.style.display = 'none'; return; }
        r = v.c.getBoundingClientRect();
        x = r.left + (pos.x - v.r.x) * r.width / v.r.w;
        y = r.top + Math.max(0, Math.min(v.r.h, pos.y - v.r.y)) * r.height / v.r.h;
      } else {
        var fr = f.getBoundingClientRect();
        r = s.getBoundingClientRect();
        x = fr.left + r.left + pos.x * r.width / s.width;
        y = fr.top + r.top + pos.y * r.height / s.height;
      }
      var b = box.getBoundingClientRect();
      dot.style.transform = 'translate(' + (x - b.left + box.scrollLeft) + 'px,' +
        (y - b.top + box.scrollTop) + 'px)';
      dot.style.display = 'block';
    }

    // g: the gesture in progress on the pad. n is the most fingers it has had,
    // hold means it began inside a tap's click delay and keeps the button down.
    var g = null, clickT = 0;
    // targetTouches, not touches: a thumb resting on a button is not a pad finger
    function mid(e) {
      var x = 0, y = 0, n = e.targetTouches.length;
      for (var i = 0; i < n; i++) { x += e.targetTouches[i].clientX; y += e.targetTouches[i].clientY; }
      return { x: x / n, y: y / n };
    }
    // held: mask of the buttons pressed under the pad, carried by every move.
    // noVNC reads the DOM `buttons` mask, where middle and right are swapped
    // against `button`: left 1, right 2, middle 4.
    var held = 0;
    function bit(b) { return [1, 4, 2][b]; }
    function click(b) {
      send('mousedown', pos.x, pos.y, held | bit(b), { button: b });
      setTimeout(function () { send('mouseup', pos.x, pos.y, held, { button: b }); }, 60);
    }
    // The pointer starts on the middle of the first display shown, so the
    // pad never drives it across a screen that is hidden.
    function ensurePos() {
      var s = canvas();
      if (!s || !s.width) return false;
      if (!pos) {
        var r = views.length ? views[0].r : { x: 0, y: 0, w: s.width, h: s.height };
        pos = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
      }
      return true;
    }
    [].forEach.call(btns.children, function (bt) {
      var b = +bt.dataset.b;
      bt.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        if (!ensurePos()) return;
        held |= bit(b);
        bt.classList.add('on');
        send('mousedown', pos.x, pos.y, held, { button: b });
      });
      function up(e) {
        e.preventDefault();
        if (!(held & bit(b))) return;
        held &= ~bit(b);
        bt.classList.remove('on');
        send('mouseup', pos.x, pos.y, held, { button: b });
      }
      bt.addEventListener('pointerup', up);
      bt.addEventListener('pointercancel', up);
      bt.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    });
    // fullscreen's way out on a phone, where there is no Escape key
    var exit = document.createElement('button');
    exit.type = 'button';
    exit.className = 'exit';
    exit.textContent = 'exit ✕';
    exit.addEventListener('click', function () { full(false); });
    btns.appendChild(exit);
    pad.addEventListener('touchstart', function (e) {
      e.preventDefault();
      if (!ensurePos()) return;
      if (!g) {
        g = { t: Date.now(), n: 0, moved: 0, sy: 0, hold: !!clickT };
        if (clickT) { clearTimeout(clickT); clickT = 0; send('mousedown', pos.x, pos.y, 1); }
      }
      g.n = Math.max(g.n, e.targetTouches.length);
      g.last = mid(e);
    }, { passive: false });
    pad.addEventListener('touchmove', function (e) {
      e.preventDefault();
      if (!g) return;
      var m = mid(e), dx = m.x - g.last.x, dy = m.y - g.last.y;
      g.last = m;
      g.moved += Math.abs(dx) + Math.abs(dy);
      if (g.n > 1) { wheel(g, dx, dy); return; }
      var k = PAD_GAIN * Math.min(PAD_ACCEL, 0.5 + Math.hypot(dx, dy) / 8);
      send('mousemove', pos.x + dx * k, pos.y + dy * k, held | (g.hold ? 1 : 0));
      follow();
    }, { passive: false });
    function padEnd(e) {
      e.preventDefault();
      if (!g) return;
      if (e.targetTouches.length) { g.last = mid(e); return; }
      var h = g, tap = e.type === 'touchend' && h.moved < PAD_TAP_PX && Date.now() - h.t < 2 * TAP_MS;
      g = null;
      if (h.hold) {
        send('mouseup', pos.x, pos.y, 0);
        if (tap) click(0); // tap, tap: a double-click
      } else if (tap && h.n > 2) {
        click(1);
      } else if (tap && h.n > 1) {
        click(2);
      } else if (tap) {
        clickT = setTimeout(function () { clickT = 0; click(0); }, TAP_MS);
      }
    }
    pad.addEventListener('touchend', padEnd, { passive: false });
    pad.addEventListener('touchcancel', padEnd, { passive: false });

    // noVNC sends one wheel step per 50 of delta, so every SCROLL_PX of
    // finger is one step. Fingers up scrolls down, as on a phone. acc carries
    // the remainder in sx, sy.
    function wheel(acc, dx, dy) {
      acc.sx = (acc.sx || 0) + dx;
      acc.sy = (acc.sy || 0) + dy;
      var sg;
      while (Math.abs(acc.sy) >= SCROLL_PX) {
        sg = acc.sy > 0 ? 1 : -1;
        acc.sy -= sg * SCROLL_PX;
        send('wheel', pos.x, pos.y, 0, { deltaY: -sg * 50 });
      }
      while (Math.abs(acc.sx) >= SCROLL_PX) {
        sg = acc.sx > 0 ? 1 : -1;
        acc.sx -= sg * SCROLL_PX;
        send('wheel', pos.x, pos.y, 0, { deltaX: -sg * 50 });
      }
    }
    // beside the pad: the Mac's scroll wheel, under the pointer. The drag
    // keeps going past the strip's edges.
    (function () {
      var a = null;
      vs.addEventListener('touchstart', function (e) {
        e.preventDefault();
        if (!ensurePos()) return;
        var t = e.changedTouches[0];
        a = { x: t.clientX, y: t.clientY };
        vs.classList.add('on');
      }, { passive: false });
      vs.addEventListener('touchmove', function (e) {
        e.preventDefault();
        if (!a) return;
        var t = e.changedTouches[0];
        wheel(a, 0, t.clientY - a.y);
        a.x = t.clientX; a.y = t.clientY;
      }, { passive: false });
      function end(e) { e.preventDefault(); a = null; vs.classList.remove('on'); }
      vs.addEventListener('touchend', end, { passive: false });
      vs.addEventListener('touchcancel', end, { passive: false });
    })();

    // The pad drags the view along when the pointer leaves the part on screen.
    function follow() {
      if (!pos || stack.scrollWidth <= stack.clientWidth) return;
      var v = views.filter(function (v) { return pos.x >= v.r.x && pos.x < v.r.x + v.r.w; })[0];
      if (!v) return;
      var r = v.c.getBoundingClientRect(), sr = stack.getBoundingClientRect();
      var x = r.left + (pos.x - v.r.x) * r.width / v.r.w - sr.left, m = 40;
      if (x < m) stack.scrollLeft += x - m;
      else if (x > sr.width - m) stack.scrollLeft += x - sr.width + m;
    }

    function wire(v) {
      var gesture = false;
      v.c.addEventListener('touchstart', function (e) {
        e.preventDefault();
        var p = e.changedTouches[0];
        // the second tap of a double-tap never reaches the Mac
        gesture = isDoubleTap(p);
        if (gesture) return;
        replay('mousemove', v, p, 0);
        replay('mousedown', v, p, 1);
      }, { passive: false });
      v.c.addEventListener('touchmove', function (e) {
        e.preventDefault();
        if (!gesture) replay('mousemove', v, e.changedTouches[0], 1);
      }, { passive: false });
      v.c.addEventListener('touchend', function (e) {
        e.preventDefault();
        if (gesture) { gesture = false; full(!box.classList.contains('full')); return; }
        replay('mouseup', v, e.changedTouches[0], 0);
      }, { passive: false });
      v.c.addEventListener('mousedown', function (e) { replay('mousedown', v, e, 1); });
      v.c.addEventListener('mousemove', function (e) { replay('mousemove', v, e, e.buttons); });
      v.c.addEventListener('mouseup', function (e) { replay('mouseup', v, e, 0); });
    }

    function build(rects) {
      stack.textContent = '';
      views = rects.slice()
        .sort(function (a, b) { return a.x - b.x || a.y - b.y; })
        .map(function (r) {
          var c = document.createElement('canvas');
          stack.appendChild(c);
          var v = { r: r, c: c, ctx: c.getContext('2d') };
          wire(v);
          return v;
        });
      size();
    }
    function unstack() {
      shown = ''; views = []; stack.textContent = '';
      box.classList.remove('stacked');
      f.style.width = f.style.height = '';
    }

    // The card and sideways full screen: the stack fits the room, no wider
    // than the width. Full upright: it fills the room's height and runs as
    // wide as that makes it, panned by follow() after the pointer.
    function size() {
      var W = across();
      var hs = views.map(function (v) { return W * v.r.h / v.r.w; });
      var total = hs.reduce(function (a, b) { return a + b; }, 0) + 2 * (views.length - 1);
      var fit = (room() - under()) / total;
      // only full upright runs wider than the phone; elsewhere the stack fits the room
      var k = !box.classList.contains('full') || box.classList.contains('side') ? Math.max(0.2, Math.min(1, fit)) : Math.max(0.2, fit);
      var dpr = lsGet(RENDER, 'auto');
      if (dpr === 'full') dpr = Infinity;
      if (dpr === 'auto') dpr = window.devicePixelRatio || 1;
      dirty = true;
      views.forEach(function (v, i) {
        var cw = Math.round(W * k), ch = Math.round(hs[i] * k);
        v.c.style.width = cw + 'px';
        v.c.style.height = ch + 'px';
        var pw = Math.min(v.r.w, Math.round(cw * dpr));
        if (v.c.width !== pw) { v.c.width = pw; v.c.height = Math.round(pw * v.r.h / v.r.w); }
      });
    }

    // Plain viewer: the frame takes the Mac screen's aspect at the card's
    // width, capped so frame and pad fit the room.
    function fit(s) {
      var h = '';
      if (!box.classList.contains('full') && connected() && s && s.width) {
        h = Math.min(Math.round(box.clientWidth * s.height / s.width),
                     room() - under()) + 'px';
      }
      if (f.style.height !== h) f.style.height = h;
    }

    // Every visible noVNC update is one drawImage on its canvas's context,
    // the 9-argument form whose last four are the damaged rect (display.js
    // flip). Any other form marks the whole canvas.
    function watch(s) {
      var ctx = s.getContext('2d'), draw = ctx.drawImage;
      if (ctx.atlasWatched) return;
      ctx.atlasWatched = true;
      ctx.drawImage = function (img, a, b, c, d, x, y, w, h) {
        if (arguments.length !== 9 || dirty === true) dirty = true;
        else if (!dirty) dirty = { l: x, t: y, r: x + w, b: y + h };
        else dirty = { l: Math.min(dirty.l, x), t: Math.min(dirty.t, y),
                       r: Math.max(dirty.r, x + w), b: Math.max(dirty.b, y + h) };
        return draw.apply(this, arguments);
      };
    }
    // Copies the damaged part of r's region onto its canvas. Dest edges are
    // whole pixels and the source is mapped back from them, so a partial copy
    // matches a full one pixel for pixel and leaves no seam.
    function copy(s, v, d) {
      var r = v.r, kx = v.c.width / r.w, ky = v.c.height / r.h;
      var l = r.x, t = r.y, rr = r.x + r.w, b = r.y + r.h;
      if (d !== true) {
        l = Math.max(l, d.l); t = Math.max(t, d.t); rr = Math.min(rr, d.r); b = Math.min(b, d.b);
        if (l >= rr || t >= b) return;
      }
      var x0 = Math.floor((l - r.x) * kx), y0 = Math.floor((t - r.y) * ky);
      var x1 = Math.min(v.c.width, Math.ceil((rr - r.x) * kx)), y1 = Math.min(v.c.height, Math.ceil((b - r.y) * ky));
      v.ctx.drawImage(s, r.x + x0 / kx, r.y + y0 / ky, (x1 - x0) / kx, (y1 - y0) / ky,
        x0, y0, x1 - x0, y1 - y0);
    }

    function tick(t) {
      if (!box.isConnected) {       // removed: let go of the window listeners
        removeEventListener('resize', onResize); removeEventListener('keydown', onKey);
        return;
      }
      requestAnimationFrame(tick);
      if (!box.getClientRects().length) return;
      if (t - lastCheck >= CHECK_MS) { lastCheck = t; check(); }
      if (!views.length || !dirty) return;
      var s = canvas();
      if (!s || !s.width) return;
      var d = dirty;
      dirty = false;
      views.forEach(function (v) { copy(s, v, d); });
    }

    // A window frame as a framebuffer rect, clipped to it; null when nothing
    // of the window is on a display.
    function crop(w, s) {
      if (!geo) return null;
      var x = Math.max(0, Math.round((w.x - geo.x0) * geo.k));
      var y = Math.max(0, Math.round((w.y - geo.y0) * geo.k));
      var r = Math.min(s.width, Math.round((w.x + w.w - geo.x0) * geo.k)) - x;
      var b = Math.min(s.height, Math.round((w.y + w.h - geo.y0) * geo.k)) - y;
      return r > 0 && b > 0 ? { name: 'window', x: x, y: y, w: r, h: b } : null;
    }

    // A new framebuffer size: one screen until /displays answers.
    function relayout(key, s) {
      geo = null;
      layout = key ? [{ name: 'screen', x: 0, y: 0, w: s.width, h: s.height }] : [];
      if (box.onlayout) box.onlayout(layout);
      if (!key) return;
      getJSON(AGENT + '/displays').then(function (d) {
        var l = seen === key && toLayout(d.displays, s);
        if (!l) return;
        geo = l.geo;
        layout = l.rects;
        shown = '';
        if (box.onlayout) box.onlayout(layout);
      }).catch(function () {});
    }

    function check() {
      place();
      var s = canvas();
      if (s) watch(s);
      var key = connected() && s && s.width ? s.width + 'x' + s.height : '';
      if (key !== seen) { seen = key; relayout(key, s); }
      var sel = lsGet(SCREEN, 'all');
      var pick = layout.filter(function (r) { return sel === 'all' || r.name === sel; });
      if (!pick.length) pick = layout;    // the saved screen is not connected
      var win = layout.length && box.win && crop(box.win, s);
      if (win) pick = [win];
      var use = pick.length && (innerHeight > innerWidth || pick.length < layout.length || win);
      if (!use) {
        if (shown) unstack();
        fit(s);
        return;
      }
      var id = key + ':' + pick.map(function (r) { return [r.name, r.x, r.y, r.w, r.h]; }).join();
      if (id !== shown) {
        shown = id;
        build(pick);
        box.classList.add('stacked');
        // Hidden viewer at framebuffer size, 1:1. noVNC reads pointers in
        // whole CSS pixels, so a 340px-wide canvas would land taps ~20 Mac
        // pixels apart; at 1:1 a replayed tap is exact.
        f.style.width = s.width + 'px';
        f.style.height = s.height + 'px';
      }
    }
    requestAnimationFrame(tick);
    function onResize() { sideways(); if (views.length) size(); }
    function onKey(e) { if (e.key === 'Escape' && box.classList.contains('full')) full(false); }
    addEventListener('resize', onResize);
    addEventListener('keydown', onKey);

    // Not stacked (landscape, every screen showing): the gestures are read
    // inside the same-origin viewer. A desktop double-click toggles only on the
    // black margin, never the screen, which the remote session needs.
    f.addEventListener('load', function () {
      var d = f.contentDocument;
      if (!d) return;
      d.addEventListener('touchend', function (e) {
        var p = e.changedTouches[0];
        if (p && isDoubleTap(p)) { e.preventDefault(); e.stopPropagation(); full(!box.classList.contains('full')); }
      }, true);
      d.addEventListener('dblclick', function (e) {
        if (e.target.tagName !== 'CANVAS') full(!box.classList.contains('full'));
      }, true);
    });
    return box;
  }

  // The screen card: toolbar over the viewer while the switch is on.
  function screenCard(card) {
    var sw = card.querySelector('h2 .sw');
    var bar = null, box = null, extra = null, into = null, layout = [];

    function button(text, title, fn) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'hbtn';
      b.textContent = text;
      b.title = title;
      b.addEventListener('click', fn);
      return b;
    }
    // one exclusive choice kept in localStorage; after(v) applies it
    function group(key, def, title, opts, after) {
      var g = document.createElement('span'), cur = lsGet(key, def);
      g.className = 'vnc-seg';
      opts.forEach(function (o) {
        var b = button(o[1], title, function () { lsSet(key, o[0]); draw(); if (after) after(); });
        b.setAttribute('aria-pressed', o[0] === cur ? 'true' : 'false');
        g.appendChild(b);
      });
      into.appendChild(g);
    }
    function seg(opts, fn) {
      var g = document.createElement('span');
      g.className = 'vnc-seg';
      opts.forEach(function (o) { g.appendChild(button(o[1], o[2], function () { fn(o[0]); })); });
      into.appendChild(g);
    }
    function win(d) {
      fetch(AGENT + '/win?do=' + d + (winId && d !== 'screen' ? '&id=' + winId : ''),
        { method: 'POST', signal: giveUp() });
    }
    // One window alone: the picker lists every window aerospace manages, the
    // frame is re-read while one is picked so a move or resize follows it.
    // A window on a hidden workspace has no picture until it is on screen:
    // picking it sends it to the main display first, as `main` does.
    // The bar is redrawn only when winId changes: rebuilding it would close
    // a picker that is open.
    var wins = [], winId = 0, winT = 0, sel = null;
    function readWins() {
      return getJSON(AGENT + '/windows').then(function (d) {
        wins = d.windows;
        var w = wins.filter(function (x) { return x.id === winId; })[0];
        if (!w && winId) { winId = 0; clearInterval(winT); draw(); }
        if (box) box.win = w && w.shown && w.w ? w : null;
        fill();
        return w;
      }).catch(function () {});
    }
    function toMain(id) {
      return fetch(AGENT + '/tomain?id=' + id, { method: 'POST', signal: giveUp() })
        .then(function () { return new Promise(function (ok) { setTimeout(ok, 300); }); })
        .then(readWins);
    }
    function pickWin(id) {
      winId = +id;
      clearInterval(winT);
      box.win = null;
      if (!winId) return;
      winT = setInterval(function () {
        if (!box || !box.isConnected) clearInterval(winT); else if (!document.hidden) readWins();
      }, WIN_POLL_MS);
      readWins().then(function (w) { if (w && !w.shown) toMain(w.id); });
    }
    function fill() {
      // frames move every poll; the options only when a window comes, goes or
      // is renamed, and touching them is what would close an open picker
      var names = wins.map(function (w) { return [w.id, w.app, w.title, w.shown]; }).join();
      if (!sel || sel.dataset.names === names) return;
      sel.dataset.names = names;
      sel.innerHTML = '<option value="0">whole screen</option>';
      wins.forEach(function (w) {
        var o = document.createElement('option');
        o.value = w.id;
        o.textContent = w.app + (w.title && w.title !== w.app ? ' — ' + w.title.slice(0, 24) : '') +
          (w.shown ? '' : ' · ' + w.ws);
        sel.appendChild(o);
      });
      sel.value = winId;
    }
    function winSelect() {
      sel = document.createElement('select');
      sel.className = 'hbtn';
      sel.title = 'show one window alone';
      sel.addEventListener('focus', function () { if (!winId) readWins(); });
      sel.addEventListener('change', function () { pickWin(sel.value); draw(); });
      fill();
      return sel;
    }

    // The bar holds only keyboard and fullscreen, so it never wraps; every
    // other control is the card under the viewer and takes no screen height.
    function draw() {
      bar.textContent = '';
      extra.textContent = '';
      sel = null;
      into = bar;
      bar.appendChild(button('keyboard', 'type on the Mac', box.keyboard));
      bar.appendChild(button('fullscreen', 'double-tap the screen to leave', function () { box.full(true); }));
      // the stacked view sizes itself from where the bar ends
      box.rerender();
      into = extra;
      if (layout.length) {
        extra.appendChild(winSelect());
        if (winId) extra.appendChild(button('to main', 'move this window to the main display',
          function () { toMain(winId); }));
      }
      if (layout.length > 1 && !winId) {
        group(SCREEN, 'all', 'screens shown', [['all', 'all']].concat(
          layout.map(function (r) { return [r.name, r.name]; })));
      }
      extra.appendChild(button('reconnect', 'drop the session and connect again', box.reload));
      group(RENDER, 'auto', 'pixels per CSS pixel in the stacked view',
        [['full', 'full'], ['auto', 'auto'], [1, '1×'], [2, '2×']], box.rerender);
      // aerospace's window commands, on the picked window or else the focused one
      var who = winId ? 'this' : 'the focused';
      seg([['float', 'float', 'float or tile ' + who + ' window'],
           ['split', 'split', 'flip the split of ' + who + ' window'],
           ['accordion', 'stack', 'accordion ' + who + ' window'],
           ['full', 'max', 'aerospace fullscreen ' + who + ' window'],
           ['prev', '◂', 'send ' + who + ' window to the previous screen'],
           ['next', '▸', 'send ' + who + ' window to the next screen'],
           ['screen', '⇆', 'focus the next screen']], win);
    }

    function on() {
      bar = document.createElement('div');
      bar.className = 'vnc-bar';
      card.appendChild(bar);
      box = mount(card);
      extra = document.createElement('div');
      extra.className = 'vnc-more';
      card.appendChild(extra);
      // the picker and screen group need the layout, so the bar waits on it
      box.onlayout = function (l) { layout = l; draw(); if (l.length) readWins(); };
      draw();
    }
    function off() {
      clearInterval(winT);
      winId = 0;
      if (box) box.remove();
      if (bar) bar.remove();
      if (extra) extra.remove();
      box = bar = extra = null;
    }
    function paint() {
      var v = lsGet(ON, false);
      sw.setAttribute('aria-checked', v ? 'true' : 'false');
      if (v && !box) on(); else if (!v && box) off();
    }
    sw.addEventListener('click', function () { lsSet(ON, !lsGet(ON, false)); paint(); });
    paint();
  }
  screenCard(host);
})();
