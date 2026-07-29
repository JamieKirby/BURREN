/* ==========================================================================
   Scriptorium shared search + ambient backdrop
   Used by every generated Scriptorium page (hub, category listings, entry
   pages). The interactive map (burren-real-map.html) reproduces the same
   search behaviour inline instead of loading this file, since the map is
   deliberately kept a single self-contained HTML file — see the comment
   near its own search code for why.

   No external dependencies (no CDN fetch, nothing to fail silently) —
   the typo-tolerant matching here is a small hand-rolled scorer rather
   than a library, since a corpus this size (dozens, not thousands, of
   entries) doesn't need one yet. If/when the corpus grows into the
   thousands, swapping this module out for something like Pagefind
   (itself a static-index generator — no server needed, so it fits this
   same GitHub Pages hosting model) is the natural next step.
   ========================================================================== */

(function () {
  'use strict';

  // ---- Ambient Ogham/Latin backdrop ----
  var AMBIENT_OGHAM = ['ᚓᚑᚋᚏᚐᚄᚔᚐ', 'ᚈᚑᚋ ᚅᚐ ᚄᚒᚔᚂ', 'ᚑᚌᚐᚋ ᚅᚑᚋᚓᚅᚂᚐᚈᚒᚏᚐ', 'ᚂᚒᚊ ᚌᚂᚐᚅ'];
  var AMBIENT_WORDS = ['limestone', 'karst', 'flora', 'field notes', 'Burren', 'pavement', 'turlough', 'scriptorium'];

  function renderAmbientBackdrop() {
    var host = document.querySelector('.ambient-backdrop svg');
    if (!host) return;
    var rows = 7;
    for (var i = 0; i < rows; i++) {
      var y = 60 + i * 130;
      var text = (i % 2 === 0 ? AMBIENT_OGHAM[i % AMBIENT_OGHAM.length] : AMBIENT_WORDS[i % AMBIENT_WORDS.length] + '  ·  ' + AMBIENT_WORDS[(i + 2) % AMBIENT_WORDS.length]);
      var g = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      g.setAttribute('x', '-200');
      g.setAttribute('y', String(y));
      g.setAttribute('class', 'ambient-row');
      g.textContent = (text + '   ').repeat(6);
      host.appendChild(g);
    }
  }

  // ---- Typo-tolerant matching ----
  // Small hand-rolled scorer: exact substring match scores highest, a
  // short Damerau-Levenshtein distance check on individual tokens catches
  // near-miss typos (transposed/missing/extra letter) without needing a
  // library. Good enough for a few dozen to a few hundred entries.
  function levenshtein(a, b) {
    if (a === b) return 0;
    var al = a.length, bl = b.length;
    if (al === 0) return bl;
    if (bl === 0) return al;
    var prev = new Array(bl + 1);
    for (var j = 0; j <= bl; j++) prev[j] = j;
    for (var i = 1; i <= al; i++) {
      var cur = [i];
      for (j = 1; j <= bl; j++) {
        var cost = a[i - 1] === b[j - 1] ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      }
      prev = cur;
    }
    return prev[bl];
  }

  function fieldScore(query, field) {
    if (!field) return 0;
    var f = field.toLowerCase();
    var q = query.toLowerCase();
    if (f === q) return 100;
    if (f.indexOf(q) !== -1) return 70;
    var tokens = f.split(/\s+/);
    var best = 0;
    tokens.forEach(function (t) {
      if (!t) return;
      var d = levenshtein(t, q);
      var tolerance = q.length <= 4 ? 1 : 2;
      if (d <= tolerance) best = Math.max(best, 40 - d * 10);
    });
    return best;
  }

  function scoreEntry(query, entry) {
    if (!query) return 1;
    var s = 0;
    s += fieldScore(query, entry.commonName) * 3;
    s += fieldScore(query, entry.scientificName) * 2;
    s += fieldScore(query, entry.oghamGloss || '') * 1.5;
    s += fieldScore(query, entry.category) * 1;
    s += fieldScore(query, entry.description) * 0.4;
    (entry.habitatTags || []).forEach(function (h) { s += fieldScore(query, h) * 0.8; });
    return s;
  }

  // ---- Search widget ----
  var ScriptoriumSearch = {
    _entries: [],
    _activeCategory: null,
    _activeHabitat: null,
    _onOpenCallback: null,

    init: function (opts) {
      opts = opts || {};
      this._basePath = opts.scriptoriumRootPrefix || '';
      this._dataUrls = opts.dataUrls || [];
      this._entryLinkFn = opts.entryLinkFn || null;
      this._loadData();
      this._buildOverlayIfMissing();
      this._wireEvents();
    },

    _loadData: function () {
      var self = this;
      this._dataUrls.forEach(function (url) {
        fetch(url).then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        }).then(function (json) {
          (json.entries || []).forEach(function (e) {
            e.kind = e.kind || 'flora';
            self._entries.push(e);
          });
        }).catch(function (err) {
          console.warn('Scriptorium search: could not load', url, err);
        });
      });
    },

    _buildOverlayIfMissing: function () {
      if (document.getElementById('searchOverlay')) return;
      var el = document.createElement('div');
      el.className = 'search-overlay';
      el.id = 'searchOverlay';
      el.innerHTML =
        '<div class="search-drawer">' +
        '  <div class="search-input-row">' +
        '    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21 L16.65 16.65"/></svg>' +
        '    <input class="search-input" id="searchInput" type="text" placeholder="Search the field guide — names, Irish, Ogham, tags…" autocomplete="off">' +
        '    <span class="search-esc">Esc</span>' +
        '  </div>' +
        '  <div class="search-facets" id="searchFacets"></div>' +
        '  <div class="search-results" id="searchResults"></div>' +
        '</div>';
      document.body.appendChild(el);
    },

    _wireEvents: function () {
      var self = this;
      document.addEventListener('keydown', function (e) {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
          e.preventDefault();
          self.toggle();
        } else if (e.key === 'Escape' && self.isOpen()) {
          self.close();
        }
      });
      var overlay = document.getElementById('searchOverlay');
      overlay.addEventListener('click', function (e) { if (e.target === overlay) self.close(); });
      var input = document.getElementById('searchInput');
      input.addEventListener('input', function () { self._renderResults(); });
      this._renderFacets();
      this._renderResults();
    },

    isOpen: function () {
      var o = document.getElementById('searchOverlay');
      return o && o.classList.contains('open');
    },
    open: function () {
      document.getElementById('searchOverlay').classList.add('open');
      var input = document.getElementById('searchInput');
      setTimeout(function () { input.focus(); }, 30);
      if (this._onOpenCallback) this._onOpenCallback('');
    },
    close: function () {
      document.getElementById('searchOverlay').classList.remove('open');
      if (this._onOpenCallback) this._onOpenCallback(null); // null = search closed, clear any dimming
    },
    toggle: function () { if (this.isOpen()) this.close(); else this.open(); },

    // Lets a host page (like the map) react to live query changes —
    // e.g. dimming non-matching markers — without this module knowing
    // anything about maps/markers itself.
    onQueryChange: function (fn) { this._onOpenCallback = fn; },

    _facetCategories: function () {
      var set = {};
      this._entries.forEach(function (e) { set[e.kind] = true; });
      return Object.keys(set);
    },
    _facetHabitats: function () {
      var set = {};
      this._entries.forEach(function (e) { (e.habitatTags || []).forEach(function (h) { set[h] = true; }); });
      return Object.keys(set).sort();
    },

    _renderFacets: function () {
      var self = this;
      var host = document.getElementById('searchFacets');
      var cats = this._facetCategories();
      var habitats = this._facetHabitats();
      var html = cats.map(function (c) {
        var label = c.charAt(0).toUpperCase() + c.slice(1);
        return '<button class="facet-chip" data-kind="' + c + '" data-active="' + (self._activeCategory === c) + '">' + label + '</button>';
      }).join('');
      html += habitats.slice(0, 6).map(function (h) {
        return '<button class="facet-chip" data-habitat="' + h + '" data-active="' + (self._activeHabitat === h) + '">' + h + '</button>';
      }).join('');
      html += '<button class="facet-chip wander" id="wanderBtn">✦ Wander</button>';
      host.innerHTML = html;
      host.querySelectorAll('[data-kind]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          self._activeCategory = self._activeCategory === btn.getAttribute('data-kind') ? null : btn.getAttribute('data-kind');
          self._renderFacets(); self._renderResults();
        });
      });
      host.querySelectorAll('[data-habitat]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          self._activeHabitat = self._activeHabitat === btn.getAttribute('data-habitat') ? null : btn.getAttribute('data-habitat');
          self._renderFacets(); self._renderResults();
        });
      });
      document.getElementById('wanderBtn').addEventListener('click', function () { self._wander(); });
    },

    _filtered: function (query) {
      var self = this;
      return this._entries
        .filter(function (e) { return !self._activeCategory || e.kind === self._activeCategory; })
        .filter(function (e) { return !self._activeHabitat || (e.habitatTags || []).indexOf(self._activeHabitat) !== -1; })
        .map(function (e) { return { entry: e, score: scoreEntry(query, e) }; })
        .filter(function (r) { return r.score > 0; })
        .sort(function (a, b) { return b.score - a.score; })
        .slice(0, 40)
        .map(function (r) { return r.entry; });
    },

    _entryLink: function (e) {
      if (this._entryLinkFn) return this._entryLinkFn(e);
      return this._basePath + 'flora/' + e.slug + '/';
    },

    _renderResults: function () {
      var input = document.getElementById('searchInput');
      var query = input ? input.value.trim() : '';
      var results = this._filtered(query);
      if (this._onOpenCallback) this._onOpenCallback(query);
      var host = document.getElementById('searchResults');
      if (!results.length) {
        host.innerHTML = '<div class="search-empty">Nothing matches yet — try a different spelling, or Wander instead.</div>';
        return;
      }
      var self = this;
      host.innerHTML = results.map(function (e) {
        var badges = '<span class="badge">' + e.category + '</span>' +
          (e.habitatTags || []).slice(0, 2).map(function (h) { return '<span class="badge habitat">' + h + '</span>'; }).join('');
        return '<div class="result-card" data-slug="' + e.slug + '">' +
          '<button class="result-play" data-say="' + e.commonName.replace(/"/g, '&quot;') + '" title="Hear pronunciation" aria-label="Hear pronunciation">' +
          '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 9v6h4l5 5V4L8 9H4Z"/></svg></button>' +
          '<div class="result-main">' +
          '<h4>' + e.commonName + '</h4>' +
          '<div class="result-meta">' + e.scientificName + (e.oghamName ? '  ·  ' + e.oghamName : '') + '</div>' +
          '<div class="result-badges">' + badges + '</div>' +
          '</div>' +
          '<div class="result-actions">' +
          '<button class="result-action-btn" data-open="' + e.slug + '">Open Entry</button>' +
          '</div>' +
          '</div>';
      }).join('');
      host.querySelectorAll('.result-play').forEach(function (btn) {
        btn.addEventListener('click', function (ev) {
          ev.stopPropagation();
          speak(btn.getAttribute('data-say'), btn);
        });
      });
      host.querySelectorAll('[data-open]').forEach(function (btn) {
        btn.addEventListener('click', function (ev) {
          ev.stopPropagation();
          var e = results.filter(function (r) { return r.slug === btn.getAttribute('data-open'); })[0];
          if (e) window.location.href = self._entryLink(e);
        });
      });
      host.querySelectorAll('.result-card').forEach(function (card) {
        card.addEventListener('click', function () {
          var e = results.filter(function (r) { return r.slug === card.getAttribute('data-slug'); })[0];
          if (e) window.location.href = self._entryLink(e);
        });
      });
    },

    // "Wander / Unearth" — clears filters and query, then narrows the
    // result list down to one random entry so the drawer reads as a
    // single surfaced find rather than a filtered search.
    _wander: function () {
      if (!this._entries.length) return;
      var pick = this._entries[Math.floor(Math.random() * this._entries.length)];
      var input = document.getElementById('searchInput');
      input.value = '';
      this._activeCategory = null; this._activeHabitat = null;
      this._renderFacets();
      var host = document.getElementById('searchResults');
      var self = this;
      var badges = '<span class="badge">' + pick.category + '</span>' +
        (pick.habitatTags || []).slice(0, 2).map(function (h) { return '<span class="badge habitat">' + h + '</span>'; }).join('');
      host.innerHTML = '<div class="result-card" data-slug="' + pick.slug + '">' +
        '<button class="result-play" data-say="' + pick.commonName.replace(/"/g, '&quot;') + '" title="Hear pronunciation">' +
        '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 9v6h4l5 5V4L8 9H4Z"/></svg></button>' +
        '<div class="result-main"><h4>✦ ' + pick.commonName + '</h4>' +
        '<div class="result-meta">' + pick.scientificName + '</div>' +
        '<div class="result-badges">' + badges + '</div></div>' +
        '<div class="result-actions"><button class="result-action-btn" data-open="' + pick.slug + '">Open Entry</button></div>' +
        '</div>';
      host.querySelector('.result-play').addEventListener('click', function (ev) { ev.stopPropagation(); speak(pick.commonName, this); });
      host.querySelector('[data-open]').addEventListener('click', function () { window.location.href = self._entryLink(pick); });
    }
  };

  function speak(text, btn) {
    if (!('speechSynthesis' in window)) return;
    var u = new SpeechSynthesisUtterance(text);
    u.rate = 0.9;
    if (btn) {
      btn.classList.add('playing');
      u.onend = function () { btn.classList.remove('playing'); };
    }
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }

  window.ScriptoriumSearch = ScriptoriumSearch;
  window.ScriptoriumCommon = { renderAmbientBackdrop: renderAmbientBackdrop, speak: speak };
  document.addEventListener('DOMContentLoaded', renderAmbientBackdrop);
})();
