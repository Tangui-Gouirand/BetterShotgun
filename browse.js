// Vue rapide : un panneau de consultation dense des événements d'une page de
// liste Shotgun (ville, salle, artiste, festival).
//
// Injecté à la demande par le popup, comme content.js. Le retour synchrone est
// remonté au popup ; le chargement des événements se poursuit en arrière-plan.
(() => {
  const NS = '__shotgunQuickView';

  // Shotgun est une application à navigation côté client : passer d'une ville
  // à l'autre ne recharge pas le document, et le monde isolé du script survit.
  // Réafficher l'instance précédente montrerait l'agenda de la ville d'avant
  // sous le nom de la nouvelle. On ne rouvre donc que sur la même page.
  if (window[NS]) {
    if (window[NS].path === location.pathname) {
      window[NS].reopen();
      return { ok: true, reopened: true };
    }
    window[NS].destroy();
  }

  /* ------------------------------------------------------------- lecture */

  // Les pages de liste sont rendues côté serveur : une carte est un <a> vers
  // /<langue>/events/<slug> contenant titre, lieu, horaire, prix et genres.
  // Aucun attribut stable n'est exposé, on s'appuie donc sur la structure
  // (premier <p>, <time datetime>) plutôt que sur les classes utilitaires,
  // sauf là où c'est inévitable.
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
      const m = t.match(/^([\d\s  ]+(?:[.,]\d{1,2})?)\s*€$/);
      if (m) {
        const n = Number(m[1].replace(/[\s  ]/g, '').replace(',', '.'));
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

  /* ------------------------------------------------- chargement complet */

  // Une page ville n'affiche que les deux jours suivants ; `?page=N` renvoie
  // en une seule requête tout l'agenda jusqu'à N jours en avant. Au-delà d'une
  // trentaine de jours la réponse sature : elle contient déjà l'agenda entier.
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

  /* --------------------------------------------------------------- état */

  const state = {
    all: [],
    q: '',
    when: 'all',
    maxPrice: null,
    genres: new Set(),
    hideSold: false,
    sort: 'date',
    view: 'list',
    cursor: -1
  };

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

  function windowFor(when) {
    const now = new Date();
    const today = dayStart(now);
    const day = 86400000;
    if (when === 'tonight') {
      return [now, new Date(today.getTime() + day + NIGHT_END_H * 3600000)];
    }
    if (when === 'tomorrow') {
      return [new Date(today.getTime() + day),
        new Date(today.getTime() + 2 * day + NIGHT_END_H * 3600000)];
    }
    if (when === 'weekend') {
      // Vendredi 18 h → lundi 6 h, en visant le prochain week-end.
      const dow = today.getDay(); // 0 dimanche … 6 samedi
      const toFriday = (5 - dow + 7) % 7;
      const friday = new Date(today.getTime() + toFriday * day);
      if (dow === 0) friday.setTime(today.getTime() - 2 * day); // on y est déjà
      if (dow === 6) friday.setTime(today.getTime() - day);
      return [new Date(friday.getTime() + 18 * 3600000),
        new Date(friday.getTime() + 3 * day + NIGHT_END_H * 3600000)];
    }
    if (when === 'week') return [now, new Date(today.getTime() + 7 * day + NIGHT_END_H * 3600000)];
    return null;
  }

  function matches(ev) {
    if (state.hideSold && ev.soldOut) return false;

    if (state.maxPrice !== null) {
      if (ev.price === null) return false;
      if (state.maxPrice === 0 ? ev.price !== 0 : ev.price > state.maxPrice) return false;
    }

    if (state.genres.size) {
      if (!ev.genres.some((g) => state.genres.has(g))) return false;
    }

    const win = windowFor(state.when);
    if (win && (ev.start < win[0] || ev.start > win[1])) return false;

    if (state.q) {
      const hay = (ev.title + ' ' + (ev.venue || '') + ' ' + ev.genres.join(' ')).toLowerCase();
      // Chaque mot doit être présent : « baby techno » trouve la soirée techno
      // au Baby Club sans exiger l'ordre des mots.
      if (!state.q.split(/\s+/).every((w) => hay.includes(w))) return false;
    }

    return true;
  }

  function visible() {
    const out = state.all.filter(matches);
    if (state.sort === 'price') {
      // Les événements sans prix affiché n'ont pas de place naturelle dans un
      // tri par prix : ils passent en fin de liste.
      out.sort((a, b) => (a.price === null) - (b.price === null) ||
        (a.price - b.price) || (a.start - b.start));
    } else if (state.sort === 'priceDesc') {
      out.sort((a, b) => (a.price === null) - (b.price === null) ||
        (b.price - a.price) || (a.start - b.start));
    }
    return out;
  }

  /* ------------------------------------------------------------ rendu UI */

  const CSS = `
:host { all: initial; }
* { box-sizing: border-box; margin: 0; padding: 0; }
.wrap {
  position: fixed; inset: 0; z-index: 2147483647;
  display: flex; flex-direction: column;
  background: #131315; color: #f4f4f5;
  font: 400 14px/1.45 "Space Grotesk", ui-sans-serif, system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
}
button, input, select { font: inherit; color: inherit; }
button { cursor: pointer; background: none; border: none; }

header { flex: 0 0 auto; padding: 14px 20px 0; border-bottom: 1px solid #2a2a2e; background: #131315; }
.top { display: flex; align-items: center; gap: 12px; }
.brand { font-weight: 700; letter-spacing: .06em; text-transform: uppercase; font-size: 13px; }
.brand b { color: #ff765f; }
.count { color: #8b8b93; font-size: 13px; font-variant-numeric: tabular-nums; }
.spacer { flex: 1; }
.close { width: 32px; height: 32px; border-radius: 8px; color: #8b8b93; font-size: 20px; line-height: 1; }
.close:hover { background: #26262b; color: #f4f4f5; }

.search { position: relative; margin: 12px 0 10px; }
.search input {
  width: 100%; padding: 10px 12px; border-radius: 10px;
  background: #1e1e22; border: 1px solid #2f2f35; outline: none;
}
.search input:focus { border-color: #ff765f; }
.search input::placeholder { color: #6f6f78; }
.kbd { position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
  color: #6f6f78; font-size: 11px; border: 1px solid #35353c; border-radius: 5px; padding: 1px 5px; }

.rows { display: flex; flex-direction: column; gap: 8px; padding-bottom: 12px; }
.row { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.chip {
  padding: 5px 11px; border-radius: 999px; border: 1px solid #33333a;
  color: #b6b6bd; font-size: 12.5px; white-space: nowrap;
}
.chip:hover { border-color: #55555f; color: #f4f4f5; }
.chip.on { background: #ff765f; border-color: #ff765f; color: #1a1a1a; font-weight: 600; }
.sep { width: 1px; height: 18px; background: #2f2f35; margin: 0 4px; }
select { background: #1e1e22; border: 1px solid #33333a; border-radius: 999px;
  padding: 5px 8px; font-size: 12.5px; color: #b6b6bd; outline: none; }

main { flex: 1 1 auto; overflow-y: auto; overscroll-behavior: contain; padding: 4px 20px 40px; }
.day { position: sticky; top: 0; z-index: 2; background: #131315;
  padding: 14px 0 6px; font-size: 12px; font-weight: 700; letter-spacing: .08em;
  text-transform: uppercase; color: #ff765f; }

.ev { display: flex; align-items: center; gap: 12px; width: 100%; text-align: left;
  padding: 9px 10px; border-radius: 10px; border: 1px solid transparent; text-decoration: none; color: inherit; }
.ev:hover, .ev.cur { background: #1c1c21; border-color: #33333a; }
.ev .h { flex: 0 0 46px; font-variant-numeric: tabular-nums; color: #cfcfd6; font-size: 13px; }
.ev .thumb { flex: 0 0 auto; width: 44px; height: 30px; border-radius: 4px; object-fit: cover; background: #26262b; }
.ev .mid { flex: 1 1 auto; min-width: 0; }
.ev .t { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ev .v { color: #8b8b93; font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ev .g { flex: 0 0 auto; display: flex; gap: 4px; max-width: 320px; overflow: hidden; }
.ev .g span { font-size: 11px; color: #8b8b93; border: 1px solid #2f2f35;
  border-radius: 999px; padding: 1px 7px; white-space: nowrap; }
.ev .p { flex: 0 0 78px; text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
.ev .p.free { color: #7ee0a8; }
.ev .p.none { color: #6f6f78; font-weight: 400; }
.ev .sold { color: #6f6f78; font-weight: 400; text-decoration: line-through; }

.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 14px; }
.grid .ev { flex-direction: column; align-items: stretch; gap: 7px; padding: 0; border: none; }
.grid .ev:hover, .grid .ev.cur { background: none; }
.grid .ev:hover .thumb, .grid .ev.cur .thumb { outline: 2px solid #ff765f; }
.grid .thumb { width: 100%; height: 118px; border-radius: 8px; }
.grid .h { flex: none; color: #ff765f; font-size: 12px; font-weight: 600; }
.grid .g { display: none; }
.grid .p { flex: none; text-align: left; font-size: 13px; }
.grid .t { white-space: normal; line-height: 1.25; }

.state { display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 10px; padding: 80px 20px; color: #8b8b93; text-align: center; }
.skel { height: 48px; border-radius: 10px; background: linear-gradient(90deg,#1c1c21,#232329,#1c1c21);
  background-size: 200% 100%; animation: sh 1.2s linear infinite; margin-bottom: 8px; }
@keyframes sh { to { background-position: -200% 0; } }
`;

  const host = document.createElement('div');
  host.setAttribute('data-shotgun-quick-view', '');
  const root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = CSS;
  root.appendChild(style);

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  const wrap = el('div', 'wrap');
  const header = el('header');
  const main = el('main');
  wrap.append(header, main);
  root.appendChild(wrap);

  /* en-tête */

  const top = el('div', 'top');
  const brand = el('div', 'brand');
  brand.append(el('b', null, 'Vue rapide'), document.createTextNode(' · Shotgun'));
  const count = el('div', 'count', '…');
  const close = el('button', 'close', '×');
  close.title = 'Fermer (Échap)';
  top.append(brand, count, el('div', 'spacer'), close);

  const searchBox = el('div', 'search');
  const search = document.createElement('input');
  search.type = 'search';
  search.placeholder = 'Rechercher un titre, une salle, un genre…';
  searchBox.append(search, el('span', 'kbd', '/'));

  const rowWhen = el('div', 'row');
  const rowGenres = el('div', 'row');
  const rows = el('div', 'rows');
  rows.append(rowWhen, rowGenres);
  header.append(top, searchBox, rows);

  function chip(label, on, onClick) {
    const b = el('button', 'chip' + (on ? ' on' : ''), label);
    b.addEventListener('click', onClick);
    return b;
  }

  function buildToolbar() {
    rowWhen.replaceChildren();
    for (const [k, label] of WHEN) {
      rowWhen.appendChild(chip(label, state.when === k, () => {
        state.when = k;
        paint();
      }));
    }
    rowWhen.appendChild(el('div', 'sep'));
    for (const [v, label] of PRICES) {
      rowWhen.appendChild(chip(label, state.maxPrice === v, () => {
        state.maxPrice = v;
        paint();
      }));
    }
    rowWhen.appendChild(el('div', 'sep'));
    rowWhen.appendChild(chip('Complets masqués', state.hideSold, () => {
      state.hideSold = !state.hideSold;
      paint();
    }));

    const spacer = el('div', 'spacer');
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

    rowWhen.append(spacer, sort, view);

    // Les genres sont ceux réellement présents dans l'agenda chargé, classés
    // par fréquence : proposer une taxonomie figée afficherait des filtres
    // qui ne renvoient rien.
    const freq = new Map();
    for (const ev of state.all) {
      for (const g of ev.genres) freq.set(g, (freq.get(g) || 0) + 1);
    }
    const top12 = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);

    rowGenres.replaceChildren();
    if (!top12.length) return;
    for (const [g] of top12) {
      rowGenres.appendChild(chip(g, state.genres.has(g), () => {
        if (state.genres.has(g)) state.genres.delete(g);
        else state.genres.add(g);
        paint();
      }));
    }
    if (state.genres.size) {
      rowGenres.appendChild(chip('Effacer', false, () => {
        state.genres.clear();
        paint();
      }));
    }
  }

  /* liste */

  const fmtDay = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long'
  });
  const fmtHour = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

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

    a.appendChild(el('div', 'h', fmtHour.format(ev.start)));

    if (state.view === 'grid' && ev.img) {
      const img = document.createElement('img');
      img.className = 'thumb';
      img.loading = 'lazy';
      img.alt = '';
      img.src = ev.img;
      a.insertBefore(img, a.firstChild);
    }

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
      s.appendChild(chip('Tout réinitialiser', false, reset));
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
        main.appendChild(el('div', 'day', fmtDay.format(ev.start)));
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

  /* ------------------------------------------------------ interactions */

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

  // Le panneau couvre la page : sans cela l'arrière-plan continue de défiler.
  let savedOverflow = '';
  function show() {
    savedOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    if (!host.isConnected) document.documentElement.appendChild(host);
    host.style.display = '';
    document.addEventListener('keydown', onKey, true);
    setTimeout(() => search.focus(), 0);
  }

  function hide() {
    host.style.display = 'none';
    document.documentElement.style.overflow = savedOverflow;
    document.removeEventListener('keydown', onKey, true);
  }

  // `destroy` doit retirer l'écouteur posé sur `document` autant que le
  // panneau : sans lui, une reconstruction laisserait derrière elle une
  // capture de clavier orpheline.
  function destroy() {
    hide();
    host.remove();
    delete window[NS];
  }

  window[NS] = { reopen: show, destroy, path: location.pathname };

  /* ---------------------------------------------------------- démarrage */

  function loading() {
    const s = el('div', null);
    for (let i = 0; i < 8; i++) s.appendChild(el('div', 'skel'));
    main.replaceChildren(s);
    count.textContent = 'Chargement de l’agenda complet…';
  }

  show();
  loading();

  loadAll().then((events) => {
    state.all = events;
    if (!events.length) {
      count.textContent = '0 événement';
      const s = el('div', 'state');
      s.appendChild(el('div', null,
        'Aucun événement lisible sur cette page. Ouvre une page de ville, de salle ou d’artiste.'));
      main.replaceChildren(s);
      return;
    }
    paint();
  }).catch(() => {
    count.textContent = 'Erreur';
    const s = el('div', 'state');
    s.appendChild(el('div', null,
      'Impossible de charger l’agenda. Recharge la page puis réessaie.'));
    main.replaceChildren(s);
  });

  return { ok: true };
})();
