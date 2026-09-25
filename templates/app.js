/* Shared by every live card and every stored preference.

   getJSON throws on a non-2xx so a 502 from a stopped upstream lands in the
   same .catch as a dead socket. lsGet/lsSet swallow: Safari in private mode
   throws on setItem, and no preference here is worth taking the page down for.

   giveUp aborts a request after 20 s: a sleeping host or a held request would
   otherwise leave a card on "reaching…" or a row greyed out for good. */
function giveUp() { return AbortSignal.timeout(20000); }
function getJSON(url, opts) {
  return fetch(url, Object.assign({ signal: giveUp() }, opts)).then(function (r) {
    if (!r.ok) throw new Error(r.status);
    return r.json();
  });
}
function lsGet(k, dflt) {
  try { var r = localStorage.getItem(k); return r ? JSON.parse(r) : dflt; }
  catch (e) { return dflt; }
}
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

// One row of a live list. data-key is the name, which prefs hides rows by.
function rowEl(name, note, value) {
  var r = document.createElement('div');
  r.className = 'ctl-row';
  r.dataset.key = name;
  r.innerHTML = '<span class="n"><b></b><span></span></span><span class="v"></span>';
  r.querySelector('b').textContent = name;
  r.querySelector('.n span').textContent = note || '';
  r.querySelector('.v').textContent = value || '';
  return r;
}

/* ---------- atlas: sections + search ---------- */
(function () {
  var nav = document.getElementById('nav');
  var tabs = [].slice.call(nav.querySelectorAll('button'));
  var secs = [].slice.call(document.querySelectorAll('section'));
  var q = document.getElementById('q');
  var empty = document.getElementById('empty');
  var atlasView = document.getElementById('view-atlas');

  // hash is "#s=<id>", never a bare element id — a bare id makes the browser
  // scroll the section under the sticky header on load.
  function hashSec() { return (location.hash.match(/^#s=(.+)$/) || [])[1]; }

  function show(id) {
    tabs.forEach(function (t) { t.classList.toggle('on', t.dataset.sec === id); });
    secs.forEach(function (s) { s.classList.toggle('on', s.id === id); });
    if (hashSec() !== id) history.replaceState(null, '', '#s=' + id);
    atlasView.scrollTop = 0;
  }
  tabs.forEach(function (t) {
    t.addEventListener('click', function () { q.value = ''; filter(); show(t.dataset.sec); });
  });

  function filter() {
    var term = q.value.trim().toLowerCase();
    document.body.classList.toggle('searching', !!term);
    var hits = 0;
    secs.forEach(function (sec) {
      var secHits = 0;
      [].slice.call(sec.querySelectorAll('.card')).forEach(function (card) {
        var rows = [].slice.call(card.querySelectorAll('tr'));
        var h2 = card.querySelector('h2');
        var titleHit = !!term && !!h2 && h2.textContent.toLowerCase().indexOf(term) > -1;
        var cardHits = 0;
        if (rows.length) {
          rows.forEach(function (r) {
            var head = r.classList.contains('hd');
            var hit = !term || titleHit || r.textContent.toLowerCase().indexOf(term) > -1;
            if (head) hit = !term || titleHit;
            r.classList.toggle('hide', !hit);
            if (hit && !head) cardHits++;
          });
        } else {
          cardHits = (!term || card.textContent.toLowerCase().indexOf(term) > -1) ? 1 : 0;
        }
        card.classList.toggle('hide', !cardHits);
        // Prose cards are collapsed <details>, so a match inside one would be
        // invisible: open what matched, and put back only what search opened.
        if (card.tagName === 'DETAILS') {
          if (term && cardHits && !card.open) { card.open = true; card.dataset.qopen = '1'; }
          else if (!term && card.dataset.qopen) { card.open = false; delete card.dataset.qopen; }
        }
        secHits += cardHits;
      });
      sec.classList.toggle('hide', !!term && !secHits);
      hits += secHits;
    });
    empty.classList.toggle('on', !hits);
  }
  q.addEventListener('input', filter);

  document.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (!atlasView.classList.contains('on')) return;
    // any other field (tile / pin modals, sliders) keeps its own keys
    var ae = document.activeElement;
    if (ae && ae !== q && (/^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) || ae.isContentEditable)) return;
    if (e.key === '/' && document.activeElement !== q) { e.preventDefault(); q.focus(); q.select(); }
    else if (e.key === 'Escape') { q.value = ''; filter(); q.blur(); }
    else if (document.activeElement !== q && /^[1-9]$/.test(e.key)) {
      var t = tabs[+e.key - 1];
      if (t) { q.value = ''; filter(); show(t.dataset.sec); }
    }
  });

  // Tiles can jump to a section instead of opening a tab (url "#s=<id>").
  window.atlasShowSection = function (id) {
    if (!tabs.some(function (t) { return t.dataset.sec === id; })) return false;
    q.value = ''; filter(); show(id);
    return true;
  };

  var start = hashSec();
  show(tabs.some(function (t) { return t.dataset.sec === start; }) ? start : tabs[0].dataset.sec);
})();

/* ---------- rail: pinned tabs, opened in-page, remembered per device ---------- */
(function () {
  var PINS = 'atlas.pins.v1', LAST = 'atlas.lastview.v1';
  var rail = document.getElementById('rail');
  var main = document.getElementById('main');
  var modal = document.getElementById('pinModal');
  var paneLinks = document.getElementById('paneLinks');
  var paneManage = document.getElementById('paneManage');
  var elLabel = document.getElementById('pinLabel');
  var elUrl = document.getElementById('pinUrl');
  var elGlyph = document.getElementById('pinGlyph');
  var preview = document.getElementById('pinPreview');

  var GLOBE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="1.3" stroke-linecap="round"><circle cx="12" cy="12" r="9"/>' +
    '<path d="M3 12h18"/><path d="M12 3c3 3.4 3 14.6 0 18M12 3C9 6.4 9 17.6 12 21"/>' +
    '<path d="M5 6.5c4.3 2.2 9.7 2.2 14 0M5 17.5c4.3-2.2 9.7-2.2 14 0"/></svg>';

  var get = lsGet, set = lsSet;

  function pageLinks() {
    var seen = {}, out = [];
    // Match on the resolved a.href, not the attribute: same-origin mounts are
    // written relative (term/, files/) and an [href^="http"] selector misses them.
    [].slice.call(document.querySelectorAll('section a[href]')).forEach(function (a) {
      var url = a.href;
      if (!/^https?:/i.test(url)) return;          // skip #anchors, mailto:
      if (seen[url]) return;
      seen[url] = 1;
      var host = '', path = '';
      try { host = new URL(url).hostname; path = new URL(url).pathname.replace(/\/$/, ''); }
      catch (e) {}
      var label = host.split('.')[0] || a.textContent.trim();
      if (path) label += ' ' + path.split('/').pop();
      out.push({ label: label, url: url, host: host });
    });
    return out;
  }

  function glyphFor(p) {
    return p.glyph || (p.label || '?').trim().charAt(0).toUpperCase() || '?';
  }
  function idFor(p) { return 'tab-' + p.url.replace(/[^a-z0-9]+/gi, '-'); }

  var pins = get(PINS, null);
  if (!pins) {   // first run here: seed with the page's links, one per host
    var seen = {};
    pins = pageLinks().filter(function (l) {
      if (seen[l.host]) return false;
      seen[l.host] = 1;
      return true;
    }).slice(0, 8).map(function (l) {
      return { label: l.host.split('.')[0], url: l.url, glyph: '' };
    });
    set(PINS, pins);
  }

  // A tab's iframe is built on first open and then kept alive, so switching
  // away and back doesn't reload the service.
  function ensureView(p) {
    var id = idFor(p);
    var el = document.getElementById(id);
    if (el) return el;
    el = document.createElement('div');
    el.className = 'view';
    el.id = id;
    el.innerHTML =
      // home: the way back to atlas when prefs hides the rail on a phone
      '<div class="frame-bar"><button data-a="home" class="home">atlas</button>' +
      '<b></b><span class="url"></span>' +
      '<button data-a="reload">reload</button>' +
      '<a data-a="ext" target="_blank" rel="noopener">open ↗</a>' +
      '<button data-a="close">close</button></div>' +
      '<div class="frame-wrap"><iframe referrerpolicy="no-referrer"></iframe></div>';
    el.querySelector('b').textContent = p.label;
    el.querySelector('.url').textContent = p.url;
    el.querySelector('[data-a="ext"]').href = p.url;
    var fr = el.querySelector('iframe');
    fr.src = p.url;
    el.querySelector('[data-a="reload"]').addEventListener('click', function () { fr.src = p.url; });
    el.querySelector('[data-a="home"]').addEventListener('click', function () {
      activate('view-atlas');
    });
    el.querySelector('[data-a="close"]').addEventListener('click', function () {
      el.remove(); activate('view-atlas');
    });
    main.appendChild(el);
    return el;
  }

  function activate(id) {
    [].slice.call(main.querySelectorAll('.view')).forEach(function (v) {
      v.classList.toggle('on', v.id === id);
    });
    set(LAST, id);
    render();
  }

  function render() {
    var active = (main.querySelector('.view.on') || {}).id || 'view-atlas';
    rail.innerHTML = '';

    var home = document.createElement('button');
    home.className = 'rail-btn' + (active === 'view-atlas' ? ' on' : '');
    home.innerHTML = '<span class="glyph">' + GLOBE + '</span><span class="cap">atlas</span>';
    home.addEventListener('click', function () { activate('view-atlas'); });
    rail.appendChild(home);

    var sep = document.createElement('div');
    sep.className = 'rail-sep';
    rail.appendChild(sep);

    pins.forEach(function (p) {
      var id = idFor(p);
      var b = document.createElement('button');
      b.className = 'rail-btn' + (active === id ? ' on' : '') +
                    (document.getElementById(id) ? ' live' : '');
      b.title = p.url;
      b.innerHTML = '<span class="glyph"></span><span class="cap"></span>';
      b.querySelector('.glyph').textContent = glyphFor(p);
      b.querySelector('.cap').textContent = p.label;
      b.addEventListener('click', function () { ensureView(p); activate(id); });
      rail.appendChild(b);
    });

    var add = document.createElement('button');
    add.className = 'rail-btn rail-add';
    add.innerHTML = '<span class="glyph">+</span><span class="cap">pin</span>';
    add.addEventListener('click', function () {
      renderLinks(); renderManage(); syncPreview(); modal.classList.add('on');
    });
    rail.appendChild(add);
  }

  function add(item) {
    if (!item.url) return;
    if (pins.some(function (p) { return p.url === item.url; })) return;
    pins.push(item);
    set(PINS, pins);
    render(); renderManage();
  }

  function renderLinks() {
    paneLinks.innerHTML = '';
    pageLinks().forEach(function (l) {
      var b = document.createElement('button');
      b.className = 'pick';
      b.innerHTML = '<b></b><span></span>';
      b.querySelector('b').textContent = l.label || l.url;
      b.querySelector('span').textContent = l.url;
      b.addEventListener('click', function () {
        add({ label: l.label || l.url, url: l.url, glyph: '' });
        b.disabled = true; b.style.opacity = '.4';
      });
      paneLinks.appendChild(b);
    });
  }

  function renderManage() {
    paneManage.innerHTML = '';
    if (!pins.length) { paneManage.innerHTML = '<p class="lede">nothing pinned yet.</p>'; return; }
    pins.forEach(function (p, i) {
      var row = document.createElement('div');
      row.className = 'manage';
      row.innerHTML = '<span class="grow"></span>' +
        '<button data-a="up">▲</button><button data-a="down">▼</button>' +
        '<button data-a="del">remove</button>';
      row.querySelector('.grow').textContent = glyphFor(p) + '  ' + p.label + ' — ' + p.url;
      row.addEventListener('click', function (e) {
        var a = e.target.dataset ? e.target.dataset.a : null;
        if (!a) return;
        if (a === 'del') {
          var v = document.getElementById(idFor(p));
          if (v) v.remove();
          pins.splice(i, 1);
        }
        if (a === 'up' && i > 0) pins.splice(i - 1, 0, pins.splice(i, 1)[0]);
        if (a === 'down' && i < pins.length - 1) pins.splice(i + 1, 0, pins.splice(i, 1)[0]);
        set(PINS, pins); render(); renderManage();
      });
      paneManage.appendChild(row);
    });
  }

  function syncPreview() {
    preview.querySelector('.glyph').textContent =
      glyphFor({ glyph: elGlyph.value.trim(), label: elLabel.value.trim() });
    preview.querySelector('.cap').textContent = elLabel.value.trim() || 'label';
  }
  [elLabel, elGlyph].forEach(function (el) { el.addEventListener('input', syncPreview); });

  document.getElementById('pinSave').addEventListener('click', function () {
    var url = elUrl.value.trim();
    if (!url) { elUrl.focus(); return; }
    if (!/^[a-z]+:\/\//i.test(url)) url = 'https://' + url;
    add({ label: elLabel.value.trim() || url.replace(/^[a-z]+:\/\//i, ''),
          url: url, glyph: elGlyph.value.trim() });
    elLabel.value = elUrl.value = elGlyph.value = '';
    syncPreview();
  });
  document.getElementById('pinClose').addEventListener('click', function () {
    modal.classList.remove('on');
  });
  modal.addEventListener('click', function (e) {
    if (e.target === modal) modal.classList.remove('on');
  });
  [].slice.call(modal.querySelectorAll('.tabs button')).forEach(function (t) {
    t.addEventListener('click', function () {
      [].slice.call(modal.querySelectorAll('.tabs button')).forEach(function (x) {
        x.classList.toggle('on', x === t);
      });
      [].slice.call(modal.querySelectorAll('.pane')).forEach(function (p) {
        p.classList.toggle('on', p.id === t.dataset.pane);
      });
    });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') modal.classList.remove('on');
  });

  window.atlasOpenTab = function (p) { ensureView(p); activate(idFor(p)); };
  window.atlasPin = function (p) { add(p); };

  render();

  // restore the last open tab (its iframe reloads; the atlas page is instant)
  var last = get(LAST, 'view-atlas');
  if (last !== 'view-atlas') {
    var p = pins.filter(function (x) { return idFor(x) === last; })[0];
    if (p) { ensureView(p); activate(last); }
  }
})();

/* ---------- front-page tiles, reload ---------- */
(function () {
  var TILES = 'atlas.tiles.v1';
  var wrapEl = document.getElementById('tiles');
  var modal = document.getElementById('tileModal');
  var fL = document.getElementById('tLabel'), fU = document.getElementById('tUrl');
  var fG = document.getElementById('tGlyph'), fN = document.getElementById('tNote');
  var editing = -1;

  document.getElementById('reloadBtn').addEventListener('click', function () {
    location.reload();
  });

  // First-run tiles; after that each device keeps its own in localStorage.
  // A url of "#s=<id>" jumps to a section instead of opening a tab.
  var DEFAULTS = [
    { label: 'example', url: 'https://example.com', glyph: 'E', note: 'opens in a tab' },
    { label: 'home', url: '#s=home', glyph: '⌂', note: 'jumps to a section' }
  ];
  function get() { return lsGet(TILES, null) || DEFAULTS.slice(); }
  var save = lsSet.bind(null, TILES);
  var tiles = get();

  function open(i) {
    editing = i;
    var t = i < 0 ? { label: '', url: '', glyph: '', note: '' } : tiles[i];
    fL.value = t.label; fU.value = t.url; fG.value = t.glyph || ''; fN.value = t.note || '';
    document.getElementById('tDelete').style.display = i < 0 ? 'none' : '';
    modal.classList.add('on');
  }
  function close() { modal.classList.remove('on'); }

  function render() {
    wrapEl.innerHTML = '';
    tiles.forEach(function (t, i) {
      var b = document.createElement('button');
      b.className = 'qtile';
      b.innerHTML = '<span class="g"></span><span class="t"><b></b><span></span></span>';
      b.querySelector('.g').textContent = t.glyph || (t.label || '?').charAt(0).toUpperCase();
      b.querySelector('b').textContent = t.label;
      b.querySelector('.t span').textContent = t.note || t.url.replace(/^https?:\/\//, '');
      b.addEventListener('click', function () {
        if (document.body.dataset.tileEdit === '1') { open(i); return; }
        if (/^#s=/.test(t.url) && window.atlasShowSection(t.url.slice(3))) return;
        window.atlasOpenTab({ label: t.label, url: new URL(t.url, location.href).href,
                              glyph: t.glyph || '' });
      });
      wrapEl.appendChild(b);
    });
    var add = document.createElement('button');
    add.className = 'qtile add';
    add.textContent = '+ tile';
    add.addEventListener('click', function () { open(-1); });
    wrapEl.appendChild(add);
  }

  document.getElementById('tileEdit').addEventListener('click', function (e) {
    var on = document.body.dataset.tileEdit === '1';
    document.body.dataset.tileEdit = on ? '0' : '1';
    e.target.classList.toggle('on', !on);
    e.target.textContent = on ? 'edit' : 'done';
    document.getElementById('tileHint').textContent = on
      ? 'Tiles live on this page and open in a tab, like the rail.'
      : 'Edit mode: tap a tile to change it.';
  });
  document.getElementById('tileClose').addEventListener('click', close);
  modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
  document.getElementById('tSave').addEventListener('click', function () {
    var url = fU.value.trim();
    if (!url) { fU.focus(); return; }
    // leave "#s=<id>" alone: it is a section on this page, not a host
    if (!/^#/.test(url) && !/^[a-z]+:\/\//i.test(url) && !/^[a-z0-9-]+\//i.test(url))
      url = 'https://' + url;
    var t = { label: fL.value.trim() || url, url: url, glyph: fG.value.trim(), note: fN.value.trim() };
    if (editing < 0) tiles.push(t); else tiles[editing] = t;
    save(tiles); render(); close();
  });
  document.getElementById('tDelete').addEventListener('click', function () {
    if (editing >= 0) { tiles.splice(editing, 1); save(tiles); render(); }
    close();
  });
  document.getElementById('tPin').addEventListener('click', function () {
    var url = fU.value.trim();
    if (!url) return;
    window.atlasPin({ label: fL.value.trim() || url,
                      url: new URL(url, location.href).href, glyph: fG.value.trim() });
    close();
  });

  render();

})();

/* ---------- prefs: what this device shows ----------
   Per device, in localStorage. Layout switches are body classes the CSS acts
   on. A hidden control is a row key per live list, re-applied by an observer
   every time that list redraws, so no card's draw code knows about prefs.
   A hidden row is only hidden: its machine keeps running, search skips it. */
(function () {
  var KEY = 'atlas.prefs.v1';
  var p = lsGet(KEY, {});
  if (!p.hide) p.hide = {};
  // [body class, label, note] — the class is set when the thing is hidden
  var LAYOUT = [
    ['norail', 'tab rail', 'phone only · tabs get an atlas button back'],
    ['notiles', 'tiles', ''],
    ['noprose', 'explainer cards', 'search still finds them']
  ];
  var modal = document.getElementById('prefModal');
  var box = document.getElementById('prefBody');
  var lists = [].slice.call(document.querySelectorAll('.card .ctl[id]'));
  var sub = document.querySelector('header .sub');
  if (sub) document.getElementById('prefLede').textContent += ' Page built ' + sub.textContent.replace(/^.*· /, '') + '.';

  function save() { lsSet(KEY, p); }
  function applyLayout() {
    LAYOUT.forEach(function (l) { document.body.classList.toggle(l[0], !!p[l[0]]); });
  }
  function applyList(list) {
    var h = p.hide[list.id] || [];
    [].slice.call(list.children).forEach(function (r) {
      if (r.dataset.key) r.classList.toggle('off', h.indexOf(r.dataset.key) > -1);
    });
  }
  lists.forEach(function (l) {
    new MutationObserver(function () { applyList(l); }).observe(l, { childList: true });
  });
  applyLayout();

  // A switch that repaints itself: the modal keeps its scroll position.
  function line(label, note, shown, set) {
    var r = rowEl(label, note, '');
    var s = document.createElement('button');
    s.type = 'button';
    s.className = 'sw';
    s.setAttribute('role', 'switch');
    s.innerHTML = '<i></i>';
    function paint() {
      s.setAttribute('aria-checked', shown ? 'true' : 'false');
      r.classList.toggle('dead', !shown);
    }
    s.addEventListener('click', function () { shown = !shown; paint(); set(shown); });
    paint();
    r.appendChild(s);
    return r;
  }
  function head(text) {
    var h = document.createElement('div');
    h.className = 'ctl-head';
    h.textContent = text;
    box.appendChild(h);
  }

  function render() {
    box.textContent = '';
    head('layout');
    LAYOUT.forEach(function (l) {
      box.appendChild(line(l[1], l[2], !p[l[0]], function (shown) {
        p[l[0]] = !shown; save(); applyLayout();
      }));
    });
    lists.forEach(function (list) {
      var keys = [].slice.call(list.children)
        .map(function (r) { return r.dataset.key; }).filter(Boolean);
      if (!keys.length) return;          // card offline: nothing to choose from
      var card = list.closest('.card').querySelector('h2 span').textContent;
      var prev = list.previousElementSibling;
      head(prev && prev.classList.contains('ctl-head') ? card + ' · ' + prev.textContent : card);
      keys.forEach(function (k) {
        var h = p.hide[list.id] || [];
        box.appendChild(line(k, '', h.indexOf(k) < 0, function (shown) {
          var cur = (p.hide[list.id] || []).filter(function (x) { return x !== k; });
          if (!shown) cur.push(k);
          p.hide[list.id] = cur;
          save(); applyList(list);
        }));
      });
    });
  }

  function close() { modal.classList.remove('on'); }
  document.getElementById('prefBtn').addEventListener('click', function () {
    render(); modal.classList.add('on');
  });
  document.getElementById('prefClose').addEventListener('click', close);
  modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  document.getElementById('prefReset').addEventListener('click', function () {
    p = { hide: {} }; save(); applyLayout(); lists.forEach(applyList); render();
  });
})();

/* ---------- iOS: keep the shell inside the visual viewport ----------
   100dvh doesn't shrink when the software keyboard opens, so anything pinned
   to the bottom ends up underneath it. visualViewport does track the keyboard,
   so pin the shell to that instead. */
(function () {
  var vv = window.visualViewport, app = document.querySelector('.app');
  if (!vv || !app) return;
  function fit() {
    var kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    app.style.height = vv.height + 'px';
    app.style.transform = 'translateY(' + vv.offsetTop + 'px)';
    document.body.classList.toggle('kb', kb > 120);
  }
  vv.addEventListener('resize', fit);
  vv.addEventListener('scroll', fit);
  window.addEventListener('orientationchange', function () { setTimeout(fit, 250); });
  fit();
})();
