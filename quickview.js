// Vue rapide de l'agenda : bibliothèque, sans effet de bord au chargement.
// `boot.js` décide quand la monter. Le popup peut aussi l'ouvrir à distance.
//
// Rien n'est écrit dans le DOM de la page : chaque surface vit dans son propre
// Shadow DOM accroché à <html>, hors du conteneur React. Shotgun peut donc
// rendre et re-rendre ce qu'il veut sans effacer l'interface.
(() => {
  // Estampille de version. Recharger l'extension pendant qu'un onglet est
  // ouvert laisse dans la page l'état de la version précédente : ses objets
  // n'ont pas forcément la même forme, et un garde qui se contenterait de
  // constater leur présence appellerait des méthodes qui n'existent plus.
  // À version différente, on démonte tout et on repart de zéro.
  const VERSION = '1.3.2';

  let SG = window.__sg;
  if (SG && SG.version !== VERSION) {
    if (typeof SG.teardown === 'function') {
      try { SG.teardown(); } catch (e) { /* une version morte n'a pas à bloquer */ }
    }
    SG = null;
  }
  if (SG && SG.quickView) return;

  // Surfaces orphelines : celles d'une version dont le `teardown` a échoué ou
  // n'existait pas. Sans ce nettoyage, un panneau plein écran resterait posé
  // sur la page sans plus rien pour le fermer.
  for (const stale of document.querySelectorAll('[data-sg], [data-shotgun-quick-view]')) {
    stale.remove();
  }
  document.documentElement.style.overflow = '';

  SG = window.__sg = {};
  SG.version = VERSION;

  /* ------------------------------------------------------------- charte */

  // Relevé sur shotgun.live (août 2026) : variables CSS du site, styles
  // calculés des boutons de filtre, des intertitres de journée et des
  // étiquettes de genre.
  SG.TOKENS = `
:host { all: initial; }
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
.sg {
  --bg: #1c1c1c;
  --fg: #ffffff;
  --muted: #a3a5a8;
  --line: rgba(255, 255, 255, .1);
  --line-strong: rgba(255, 255, 255, .22);
  --fill: rgba(255, 255, 255, .1);
  --accent: #ff765f;
  --success: #5bc870;
  --danger: #d11c00;
  --r: 8px;
  --rb: 4px;
  font: 400 14px/1.45 "Space Grotesk", "Space Grotesk Fallback", ui-sans-serif, system-ui, sans-serif;
  color: var(--fg);
  -webkit-font-smoothing: antialiased;
}
button, input, select { font: inherit; color: inherit; }
button { cursor: pointer; background: none; border: none; }
/* Les titres du site sont en monumentExtendedBlack. Une @font-face déclarée
   dans le document s'applique aussi dans un Shadow DOM : la police du site
   est donc disponible ici sans la recharger. */
.title-font {
  font-family: monumentExtendedBlack, "monumentExtendedBlack Fallback", sans-serif;
  font-weight: 900; text-transform: uppercase;
}
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  height: 44px; padding: 0 20px; border-radius: var(--rb);
  background: var(--fill); color: var(--fg);
  font-size: 14px; font-weight: 700; letter-spacing: .7px; text-transform: uppercase;
  text-decoration: none; white-space: nowrap;
  transition: background .12s ease, color .12s ease;
}
.btn:hover { background: rgba(255, 255, 255, .18); }
.btn-accent { background: var(--accent); color: #1c1c1c; }
.btn-accent:hover { background: #ff8b77; }
.icon { width: 16px; height: 16px; flex: none; fill: none; stroke: currentColor;
  stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
`;

  const SVG_NS = 'http://www.w3.org/2000/svg';

  const PATHS = {
    pin: ['M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 1 1 16 0Z', 'M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z'],
    list: ['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3 6h.01', 'M3 12h.01', 'M3 18h.01'],
    close: ['M18 6 6 18', 'm6 6 12 12'],
    search: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z', 'm21 21-4.3-4.3'],
    copy: ['M9 9h10v12H9z', 'M5 15H4V3h12v1'],
    check: ['m4 12 5 5L20 6'],
    warn: ['M12 9v4', 'M12 17h.01', 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z'],
    ext: ['M15 3h6v6', 'M10 14 21 3', 'M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5'],
    send: ['M21 3 3 10l7 3 3 7 8-17Z'],
    camera: ['M3 8a5 5 0 0 1 5-5h8a5 5 0 0 1 5 5v8a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5z', 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z']
  };

  SG.icon = (name) => {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'icon');
    svg.setAttribute('viewBox', '0 0 24 24');
    for (const d of PATHS[name] || []) {
      const p = document.createElementNS(SVG_NS, 'path');
      p.setAttribute('d', d);
      svg.appendChild(p);
    }
    return svg;
  };

  SG.el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  // Une surface = un hôte accroché à <html>, hors de la racine React.
  SG.surface = (name, css) => {
    const host = document.createElement('div');
    host.setAttribute('data-sg', name);
    const root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = SG.TOKENS + css;
    root.appendChild(style);
    return { host, root };
  };

  const el = SG.el;
  const icon = SG.icon;

  /* ------------------------------------------------------------- lecture */

  const CARD_SELECTOR = 'a[href*="/events/"]';

  function firstLeaf(root, selector, reject) {
    for (const n of root.querySelectorAll(selector)) {
      if (n.children.length) continue;
      const t = (n.textContent || '').trim();
      if (t.length > 1 && !(reject && reject.test(t))) return t;
    }
    return null;
  }

  // Le prix est un <span> sans classe, voisin des <time>. Le lire sur le texte
  // complet de la carte collerait l'heure au montant : « 23:59 » suivi de
  // « 26,00 € » se lit alors « 23:5926,00 € ».
  function readPrice(card) {
    const spans = [...card.querySelectorAll('span')].filter((s) => !s.children.length);
    for (let i = spans.length - 1; i >= 0; i--) {
      const t = (spans[i].textContent || '').trim();
      if (/^(gratuit|free|grátis|gratis)$/i.test(t)) return { price: 0, free: true };
      const m = t.match(/^([\d\s  ]+(?:[.,]\d{1,2})?)\s*€$/);
      if (m) {
        const n = Number(m[1].replace(/[\s  ]/g, '').replace(',', '.'));
        if (Number.isFinite(n)) return { price: n, free: n === 0 };
      }
    }
    return { price: null, free: false };
  }

  // « +3 » n'est pas un genre mais le compteur de genres masqués par Shotgun.
  function readGenres(card) {
    const out = [];
    for (const n of card.querySelectorAll('[class*="rounded-full"]')) {
      if (n.children.length) continue;
      const t = (n.textContent || '').trim();
      if (!t || t.length > 28 || /^\+\d+$/.test(t)) continue;
      if (!out.includes(t)) out.push(t);
    }
    return out;
  }

  // Le mot est cherché sur un élément qui ne contient que lui : « complet »
  // apparaît aussi dans des titres de soirée, et un titre ne doit pas faire
  // disparaître le prix.
  const SOLD_OUT_RE = /^(complet|sold\s?out|épuisé|esgotado)$/i;

  function isSoldOut(card) {
    for (const n of card.querySelectorAll('span, div, p')) {
      if (!n.children.length && SOLD_OUT_RE.test((n.textContent || '').trim())) return true;
    }
    return false;
  }

  function readCard(card) {
    const href = card.getAttribute('href');
    if (!href || !/\/events\/[^/?#]+/.test(href)) return null;

    const time = card.querySelector('time[datetime]');
    const start = time ? new Date(time.getAttribute('datetime')) : null;
    if (!start || Number.isNaN(start.getTime())) return null;

    const title = firstLeaf(card, 'p');
    if (!title) return null;

    const img = card.querySelector('img');
    const src = img && img.getAttribute('src');
    const { price, free } = readPrice(card);

    return {
      href,
      title,
      // Shotgun affiche ici le nom de la salle, ou la ville quand le lieu
      // n'est pas divulgué. Le « | » qui sépare date et heure porte la même
      // classe et doit être écarté.
      venue: firstLeaf(card, '[class*="text-muted-foreground"]', /^[|·—-]$/),
      start,
      price,
      free,
      soldOut: isSoldOut(card),
      genres: readGenres(card),
      // On ne réutilise que les vignettes servies par le CDN du site.
      img: src && /^https:\/\/res\.cloudinary\.com\//.test(src) ? src : null
    };
  }

  function parseDoc(doc) {
    // « Épinglé » reprend en tête des événements présents plus bas dans la
    // page, mais sous une forme promotionnelle : le titre y est remplacé par
    // l'accroche de l'organisateur et la salle n'est pas affichée. À slug
    // égal, on garde donc la carte qui porte un nom de salle.
    const byHref = new Map();
    for (const card of doc.querySelectorAll(CARD_SELECTOR)) {
      const ev = readCard(card);
      if (!ev) continue;
      const kept = byHref.get(ev.href);
      if (!kept || (!kept.venue && ev.venue)) byHref.set(ev.href, ev);
    }
    return [...byHref.values()].sort((a, b) => a.start - b.start);
  }

  SG.parseDoc = parseDoc;

  /* ------------------------------------------------- chargement complet */

  // Une page ville n'affiche que les deux jours suivants ; `?page=N` renvoie
  // en une seule requête tout l'agenda jusqu'à N jours en avant. Au-delà d'une
  // trentaine de jours la réponse sature : elle contient déjà l'agenda entier.
  //
  // Cette requête ne part qu'à l'ouverture de la vue, jamais au chargement de
  // la page : personne n'a demandé 2,5 Mo pour une ville qu'on ne fait que
  // traverser.
  const CITY_RE = /^\/[^/]+\/cities\/[^/]+/;
  const FULL_PAGE = 30;

  async function loadAll() {
    const path = location.pathname;
    if (!CITY_RE.test(path)) return parseDoc(document);

    const r = await fetch(path + '?page=' + FULL_PAGE, {
      credentials: 'same-origin',
      headers: { Accept: 'text/html' }
    });
    if (!r.ok) throw new Error('http ' + r.status);
    const events = parseDoc(new DOMParser().parseFromString(await r.text(), 'text/html'));
    // Une réponse inattendue ne doit pas donner une vue vide alors que la page
    // affichée contient déjà des événements exploitables.
    return events.length ? events : parseDoc(document);
  }

  /* ------------------------------------------------------------- filtres */

  const WHEN = [
    ['all', 'Tout'],
    ['tonight', 'Ce soir'],
    ['tomorrow', 'Demain'],
    ['weekend', 'Week-end'],
    ['week', '7 jours']
  ];

  const PRICES = [
    [null, 'Tout prix'],
    [0, 'Gratuit'],
    [10, '≤ 10 €'],
    [20, '≤ 20 €'],
    [35, '≤ 35 €']
  ];

  function dayStart(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  // Une soirée qui commence à 1 h du matin appartient à la nuit de la veille :
  // « ce soir » couvre donc jusqu'à 6 h le lendemain.
  const NIGHT_END_H = 6;
  const DAY = 86400000;

  function windowFor(when) {
    const now = new Date();
    const today = dayStart(now);
    if (when === 'tonight') {
      return [now, new Date(today.getTime() + DAY + NIGHT_END_H * 3600000)];
    }
    if (when === 'tomorrow') {
      return [new Date(today.getTime() + DAY),
        new Date(today.getTime() + 2 * DAY + NIGHT_END_H * 3600000)];
    }
    if (when === 'weekend') {
      // Vendredi 18 h → lundi 6 h, en visant le prochain week-end.
      const dow = today.getDay(); // 0 dimanche … 6 samedi
      const friday = new Date(today.getTime() + ((5 - dow + 7) % 7) * DAY);
      if (dow === 0) friday.setTime(today.getTime() - 2 * DAY); // on y est déjà
      if (dow === 6) friday.setTime(today.getTime() - DAY);
      return [new Date(friday.getTime() + 18 * 3600000),
        new Date(friday.getTime() + 3 * DAY + NIGHT_END_H * 3600000)];
    }
    if (when === 'week') return [now, new Date(today.getTime() + 7 * DAY + NIGHT_END_H * 3600000)];
    return null;
  }

  /* --------------------------------------------------------------- vue */

  const VIEW_CSS = `
.wrap { position: fixed; inset: 0; z-index: 2147483646; display: flex; flex-direction: column;
  background: var(--bg); }
header { flex: 0 0 auto; padding: 16px 24px 0; border-bottom: 1px solid var(--line); }
.top { display: flex; align-items: center; gap: 14px; }
.brand { font-size: 20px; }
.brand em { color: var(--accent); font-style: normal; }
.count { color: var(--muted); font-size: 13px; font-variant-numeric: tabular-nums; }
.spacer { flex: 1; }
.close { width: 44px; height: 44px; border-radius: var(--rb); color: var(--muted);
  display: grid; place-items: center; }
.close:hover { background: var(--fill); color: var(--fg); }
.close .icon { width: 20px; height: 20px; }

.search { position: relative; margin: 14px 0 12px; }
.search input { width: 100%; height: 44px; padding: 0 14px 0 42px; border-radius: var(--rb);
  background: var(--fill); border: 1px solid transparent; outline: none; font-size: 15px; }
.search input:focus { border-color: var(--accent); }
.search input::placeholder { color: var(--muted); }
.search .icon { position: absolute; left: 14px; top: 14px; color: var(--muted); }
.kbd { position: absolute; right: 14px; top: 12px; color: var(--muted); font-size: 12px;
  border: 1px solid var(--line); border-radius: var(--rb); padding: 1px 7px; }

.rows { display: flex; flex-direction: column; gap: 10px; padding-bottom: 14px; }
.row { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.chip { height: 36px; padding: 0 16px; border-radius: var(--rb); background: var(--fill);
  color: var(--fg); font-size: 12px; font-weight: 700; letter-spacing: .7px;
  text-transform: uppercase; white-space: nowrap; }
.chip:hover { background: rgba(255, 255, 255, .18); }
.chip.on { background: var(--accent); color: #1c1c1c; }
.chip-quiet { background: none; border: 1px solid var(--line); color: var(--muted); }
.chip-quiet:hover { background: var(--fill); color: var(--fg); }
.sep { width: 1px; height: 20px; background: var(--line); margin: 0 6px; }
select { height: 36px; background: var(--fill); border: none; border-radius: var(--rb);
  padding: 0 10px; font-size: 12px; font-weight: 700; letter-spacing: .7px;
  text-transform: uppercase; color: var(--fg); outline: none; }

main { flex: 1 1 auto; overflow-y: auto; overscroll-behavior: contain; padding: 0 24px 48px; }
.day { position: sticky; top: 0; z-index: 2; background: var(--bg); width: max-content;
  padding: 18px 8px 8px 0; font-size: 20px; }

.ev { display: flex; align-items: center; gap: 14px; width: 100%; text-align: left;
  padding: 10px; border-radius: var(--r); text-decoration: none; color: inherit; }
.ev:hover, .ev.cur { background: var(--fill); }
.ev .h { flex: 0 0 48px; font-variant-numeric: tabular-nums; color: var(--fg); font-size: 14px;
  font-weight: 700; }
.ev .thumb { flex: 0 0 auto; width: 64px; height: 40px; object-fit: cover;
  background: rgba(255, 255, 255, .06); }
.ev .mid { flex: 1 1 auto; min-width: 0; }
.ev .t { font-size: 16px; font-weight: 700; white-space: nowrap; overflow: hidden;
  text-overflow: ellipsis; }
.ev .v { color: var(--muted); font-size: 14px; white-space: nowrap; overflow: hidden;
  text-overflow: ellipsis; }
.ev .g { flex: 0 0 auto; display: flex; gap: 5px; max-width: 340px; overflow: hidden; }
.ev .g span { font-size: 10px; font-weight: 500; letter-spacing: .3px; text-transform: uppercase;
  color: var(--muted); border: 1px solid var(--line); border-radius: 999px; padding: 2px 10px;
  white-space: nowrap; }
.ev .p { flex: 0 0 88px; text-align: right; font-variant-numeric: tabular-nums;
  font-size: 15px; font-weight: 700; }
.ev .p.free { color: var(--success); }
.ev .p.none { color: var(--muted); font-weight: 400; }
.ev .p.sold { color: var(--muted); font-size: 11px; font-weight: 700; letter-spacing: .7px;
  text-transform: uppercase; }

.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 20px; }
.grid .ev { flex-direction: column; align-items: stretch; gap: 8px; padding: 0; }
.grid .ev:hover, .grid .ev.cur { background: none; }
.grid .ev:hover .thumb, .grid .ev.cur .thumb { outline: 2px solid var(--accent); }
.grid .thumb { width: 100%; height: 128px; }
.grid .h { flex: none; color: var(--accent); font-size: 13px; }
.grid .g { display: none; }
.grid .p { flex: none; text-align: left; }
.grid .t { white-space: normal; line-height: 1.25; }

.state { display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 14px; padding: 90px 20px; color: var(--muted); text-align: center; }
.skel { height: 60px; border-radius: var(--r); background: var(--fill);
  animation: pulse 1.3s ease-in-out infinite; margin-bottom: 10px; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .45; } }
@media (prefers-reduced-motion: reduce) { .skel { animation: none; } }
`;

  const fmtDay = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  const fmtHour = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

  function create() {
    const state = {
      all: [],
      q: '',
      when: 'all',
      maxPrice: null,
      genres: new Set(),
      hideSold: false,
      sort: 'date',
      view: 'list',
      cursor: -1,
      loaded: false
    };

    const { host, root } = SG.surface('quick-view', VIEW_CSS);
    const wrap = el('div', 'sg wrap');
    const header = el('header');
    const main = el('main');
    wrap.append(header, main);
    root.appendChild(wrap);

    const top = el('div', 'top');
    const brand = el('div', 'brand title-font');
    brand.append(el('em', null, 'Agenda'), document.createTextNode(' complet'));
    const count = el('div', 'count', '');
    const close = el('button', 'close');
    close.title = 'Fermer (Échap)';
    close.appendChild(icon('close'));
    top.append(brand, count, el('div', 'spacer'), close);

    const searchBox = el('div', 'search');
    const search = document.createElement('input');
    search.type = 'search';
    search.placeholder = 'Rechercher un titre, une salle, un genre…';
    searchBox.append(icon('search'), search, el('span', 'kbd', '/'));

    const rowWhen = el('div', 'row');
    const rowGenres = el('div', 'row');
    const rows = el('div', 'rows');
    rows.append(rowWhen, rowGenres);
    header.append(top, searchBox, rows);

    function chip(label, on, onClick, quiet) {
      const b = el('button', 'chip' + (on ? ' on' : '') + (quiet ? ' chip-quiet' : ''), label);
      b.addEventListener('click', onClick);
      return b;
    }

    function matches(ev) {
      if (state.hideSold && ev.soldOut) return false;

      if (state.maxPrice !== null) {
        if (ev.price === null) return false;
        if (state.maxPrice === 0 ? ev.price !== 0 : ev.price > state.maxPrice) return false;
      }

      if (state.genres.size && !ev.genres.some((g) => state.genres.has(g))) return false;

      const win = windowFor(state.when);
      if (win && (ev.start < win[0] || ev.start > win[1])) return false;

      if (state.q) {
        const hay = (ev.title + ' ' + (ev.venue || '') + ' ' + ev.genres.join(' ')).toLowerCase();
        // Chaque mot doit être présent : « baby techno » trouve la soirée
        // techno au Baby Club sans exiger l'ordre des mots.
        if (!state.q.split(/\s+/).every((w) => hay.includes(w))) return false;
      }

      return true;
    }

    function visible() {
      const out = state.all.filter(matches);
      // Les événements sans prix affiché n'ont pas de place naturelle dans un
      // tri par prix : ils passent en fin de liste.
      if (state.sort === 'price') {
        out.sort((a, b) => (a.price === null) - (b.price === null) ||
          (a.price - b.price) || (a.start - b.start));
      } else if (state.sort === 'priceDesc') {
        out.sort((a, b) => (a.price === null) - (b.price === null) ||
          (b.price - a.price) || (a.start - b.start));
      }
      return out;
    }

    function buildToolbar() {
      rowWhen.replaceChildren();
      for (const [k, label] of WHEN) {
        rowWhen.appendChild(chip(label, state.when === k, () => { state.when = k; paint(); }));
      }
      rowWhen.appendChild(el('div', 'sep'));
      for (const [v, label] of PRICES) {
        rowWhen.appendChild(chip(label, state.maxPrice === v, () => { state.maxPrice = v; paint(); }));
      }
      rowWhen.appendChild(el('div', 'sep'));
      rowWhen.appendChild(chip('Sans les complets', state.hideSold, () => {
        state.hideSold = !state.hideSold;
        paint();
      }));

      const sort = document.createElement('select');
      for (const [v, label] of [['date', 'Par date'], ['price', 'Prix croissant'],
        ['priceDesc', 'Prix décroissant']]) {
        sort.appendChild(new Option(label, v, false, state.sort === v));
      }
      sort.addEventListener('change', () => { state.sort = sort.value; paint(); });

      const view = document.createElement('select');
      for (const [v, label] of [['list', 'Liste'], ['grid', 'Affiches']]) {
        view.appendChild(new Option(label, v, false, state.view === v));
      }
      view.addEventListener('change', () => { state.view = view.value; paint(); });

      rowWhen.append(el('div', 'spacer'), sort, view);

      // Les genres sont ceux réellement présents dans l'agenda chargé, classés
      // par fréquence : proposer une taxonomie figée afficherait des filtres
      // qui ne renvoient rien.
      const freq = new Map();
      for (const ev of state.all) {
        for (const g of ev.genres) freq.set(g, (freq.get(g) || 0) + 1);
      }
      const top12 = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);

      rowGenres.replaceChildren();
      for (const [g] of top12) {
        rowGenres.appendChild(chip(g, state.genres.has(g), () => {
          if (state.genres.has(g)) state.genres.delete(g);
          else state.genres.add(g);
          paint();
        }, !state.genres.has(g)));
      }
      if (state.genres.size) {
        rowGenres.appendChild(chip('Effacer', false, () => { state.genres.clear(); paint(); }, true));
      }
    }

    function priceLabel(ev) {
      if (ev.free || ev.price === 0) return { text: 'Gratuit', cls: 'free' };
      if (ev.price === null) return { text: '—', cls: 'none' };
      const n = Number.isInteger(ev.price) ? ev.price : ev.price.toFixed(2).replace('.', ',');
      return { text: n + ' €', cls: '' };
    }

    function rowFor(ev) {
      const a = el('a', 'ev');
      a.href = new URL(ev.href, location.origin).href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';

      if (ev.img) {
        const img = document.createElement('img');
        img.className = 'thumb';
        img.loading = 'lazy';
        img.alt = '';
        img.src = ev.img;
        a.appendChild(img);
      }
      a.appendChild(el('div', 'h', fmtHour.format(ev.start)));

      const mid = el('div', 'mid');
      mid.appendChild(el('div', 't', ev.title));
      if (ev.venue) mid.appendChild(el('div', 'v', ev.venue));
      a.appendChild(mid);

      if (ev.genres.length) {
        const g = el('div', 'g');
        for (const x of ev.genres.slice(0, 3)) g.appendChild(el('span', null, x));
        a.appendChild(g);
      }

      if (ev.soldOut) {
        a.appendChild(el('div', 'p sold', 'Complet'));
      } else {
        const p = priceLabel(ev);
        a.appendChild(el('div', 'p ' + p.cls, p.text));
      }
      return a;
    }

    function paint() {
      buildToolbar();
      const list = visible();
      state.cursor = -1;

      count.textContent = list.length + ' / ' + state.all.length + ' événements';
      main.replaceChildren();

      if (!list.length) {
        const s = el('div', 'state');
        s.appendChild(el('div', null, 'Aucun événement ne correspond à ces filtres.'));
        s.appendChild(chip('Tout réinitialiser', false, reset, true));
        main.appendChild(s);
        return;
      }

      // Le tri par prix casse la chronologie : les intertitres de journée
      // n'auraient plus de sens, on les omet dans ce cas.
      if (state.sort !== 'date') {
        const box = el('div', state.view === 'grid' ? 'grid' : '');
        for (const ev of list) box.appendChild(rowFor(ev));
        main.appendChild(box);
        return;
      }

      let currentKey = null;
      let box = null;
      for (const ev of list) {
        const key = ev.start.toDateString();
        if (key !== currentKey) {
          currentKey = key;
          main.appendChild(el('div', 'day title-font', fmtDay.format(ev.start)));
          box = el('div', state.view === 'grid' ? 'grid' : '');
          main.appendChild(box);
        }
        box.appendChild(rowFor(ev));
      }
    }

    function reset() {
      state.q = '';
      search.value = '';
      state.when = 'all';
      state.maxPrice = null;
      state.genres.clear();
      state.hideSold = false;
      paint();
    }

    let debounce = null;
    search.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        state.q = search.value.trim().toLowerCase();
        paint();
      }, 120);
    });

    function move(delta) {
      const items = [...main.querySelectorAll('.ev')];
      if (!items.length) return;
      if (state.cursor >= 0 && items[state.cursor]) items[state.cursor].classList.remove('cur');
      state.cursor = Math.max(0, Math.min(items.length - 1, state.cursor + delta));
      const cur = items[state.cursor];
      cur.classList.add('cur');
      cur.scrollIntoView({ block: 'nearest' });
    }

    function onKey(e) {
      if (e.key === 'Escape') { hide(); return; }
      if (e.key === '/' && root.activeElement !== search) {
        e.preventDefault();
        search.focus();
        search.select();
        return;
      }
      if (e.key === 'Enter' && state.cursor >= 0) {
        const items = [...main.querySelectorAll('.ev')];
        if (items[state.cursor]) { items[state.cursor].click(); e.preventDefault(); }
        return;
      }
      if (e.key === 'ArrowDown' || (e.key === 'j' && root.activeElement !== search)) {
        e.preventDefault(); move(1);
      } else if (e.key === 'ArrowUp' || (e.key === 'k' && root.activeElement !== search)) {
        e.preventDefault(); move(-1);
      }
    }

    close.addEventListener('click', () => hide());

    function loading() {
      const s = el('div', null);
      for (let i = 0; i < 8; i++) s.appendChild(el('div', 'skel'));
      main.replaceChildren(s);
      count.textContent = 'Chargement…';
    }

    function fail() {
      count.textContent = '';
      const s = el('div', 'state');
      s.appendChild(icon('warn'));
      s.appendChild(el('div', null, 'Impossible de charger l’agenda. Recharge la page puis réessaie.'));
      main.replaceChildren(s);
    }

    // Le panneau couvre la page : sans cela l'arrière-plan continue de défiler.
    let savedOverflow = '';
    let onHide = null;

    function show(opts) {
      onHide = (opts && opts.onHide) || null;
      savedOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = 'hidden';
      if (!host.isConnected) document.documentElement.appendChild(host);
      host.style.display = '';
      document.addEventListener('keydown', onKey, true);
      setTimeout(() => search.focus(), 0);

      if (state.loaded) return;
      loading();
      loadAll().then((events) => {
        state.loaded = true;
        state.all = events;
        if (!events.length) {
          count.textContent = '';
          const s = el('div', 'state');
          s.appendChild(el('div', null, 'Aucun événement lisible sur cette page.'));
          main.replaceChildren(s);
          return;
        }
        paint();
      }).catch(fail);
    }

    function hide() {
      host.style.display = 'none';
      document.documentElement.style.overflow = savedOverflow;
      document.removeEventListener('keydown', onKey, true);
      if (onHide) onHide();
    }

    function destroy() {
      hide();
      host.remove();
    }

    return { show, hide, destroy };
  }

  SG.quickView = { create };
})();
