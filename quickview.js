// Vue rapide de l'agenda : bibliothèque, sans effet de bord au chargement.
// `boot.js` décide quand la monter. Chaque surface est un Shadow DOM accroché
// à <html>, pour qu'aucun style ne fuie dans un sens ni dans l'autre.
(() => {
  // Estampille de version : un rechargement d'extension laisse dans la page
  // l'état de la version d'avant, dont la forme peut différer. À version
  // différente, on démonte tout et on repart de zéro.
  const VERSION = '1.6.1';

  let SG = window.__sg;
  if (SG && SG.version !== VERSION) {
    if (typeof SG.teardown === 'function') {
      try { SG.teardown(); } catch (e) { /* une version morte n'a pas à bloquer */ }
    }
    SG = null;
  }
  if (SG && SG.quickView) return;

  // Surfaces orphelines d'une version dont le teardown a échoué ou manquait.
  for (const stale of document.querySelectorAll('[data-sg], [data-shotgun-quick-view]')) {
    stale.remove();
  }
  document.documentElement.style.overflow = '';

  SG = window.__sg = {};
  SG.version = VERSION;

  /* ------------------------------------------------------------- charte */

  // Relevé sur shotgun.live : variables CSS et styles calculés du site.
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
    grid: ['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M3 14h7v7H3z', 'M14 14h7v7h-7z'],
    plus: ['M12 5v14', 'M5 12h14'],
    minus: ['M5 12h14'],
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

  // Prix : un <span> sans classe. Le lire sur le texte entier de la carte
  // collerait l'heure au montant : « 23:59 » + « 26,00 € » = « 23:5926,00 € ».
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

  // Cherché sur un élément qui ne contient que lui : « complet » apparaît aussi
  // dans des titres de soirée.
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
      // Nom de salle, ou ville si le lieu n'est pas divulgué. Le « | » séparateur
      // porte la même classe et doit être écarté.
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
    // « Épinglé » reprend les mêmes événements sans salle ni vrai titre : à slug
    // égal, on garde la carte qui porte un nom de salle.
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

  // Une page ville n'affiche que deux jours ; ?page=N renvoie tout l'agenda.
  // Demandé à l'ouverture de la vue, jamais au chargement de la page.
  const CITY_RE = /^\/[^/]+\/cities\/([^/?#]+)/;
  const FULL_PAGE = 30;

  // Sur l'accueil, la sélection de villes démarre vide.
  const HOME_RE = /^\/(?:[a-z]{2}(?:-[a-z]{2})?)?\/?$/i;

  const locale = () => {
    const seg = location.pathname.split('/')[1] || '';
    return /^[a-z]{2}(-[a-z]{2})?$/i.test(seg) ? seg : 'fr';
  };
  const citySlug = () => {
    const m = location.pathname.match(CITY_RE);
    return m ? m[1] : null;
  };
  const isHome = () => HOME_RE.test(location.pathname);

  async function fetchDoc(path) {
    const r = await fetch(path, { credentials: 'same-origin', headers: { Accept: 'text/html' } });
    if (!r.ok) throw new Error('http ' + r.status);
    return new DOMParser().parseFromString(await r.text(), 'text/html');
  }

  // Le nom de la ville vient du slug demandé : les cartes ne le portent pas.
  async function loadCity(slug, name) {
    const events = parseDoc(await fetchDoc('/' + locale() + '/cities/' + slug + '?page=' + FULL_PAGE));
    for (const ev of events) {
      ev.citySlug = slug;
      ev.cityName = name || slug;
    }
    return events;
  }

  /* --------------------------------------------------- index des villes */

  // Index des villes, gardé une journée : il bouge lentement.
  const CITIES_KEY = 'citiesIndex';
  const CITIES_TTL_MS = 24 * 60 * 60 * 1000;
  const COUNT_RE = /^(.*?)([\d][\d\s  ]*)\s*(?:évènements?|events?|eventos?)$/i;

  let citiesPromise = null;

  function parseCities(doc, loc) {
    const out = [];
    const seen = new Set();
    for (const a of doc.querySelectorAll('a[href^="/' + loc + '/cities/"]')) {
      const href = a.getAttribute('href') || '';
      const slug = href.split('/').pop().split('?')[0];
      const text = (a.textContent || '').trim().replace(/\s+/g, ' ');
      if (!slug || !text || seen.has(slug)) continue;
      seen.add(slug);
      // Le libellé colle le nom au compteur : « Paris2 493 évènements ».
      const m = text.match(COUNT_RE);
      out.push({
        slug,
        name: m ? m[1].trim() : text,
        count: m ? Number(m[2].replace(/[\s  ]/g, '')) : null
      });
    }
    return out.sort((a, b) => (b.count || 0) - (a.count || 0));
  }

  function cities() {
    if (citiesPromise) return citiesPromise;
    citiesPromise = (async () => {
      try {
        const hit = (await chrome.storage.local.get(CITIES_KEY))[CITIES_KEY];
        if (hit && hit.at && Date.now() - hit.at < CITIES_TTL_MS && hit.value.length) return hit.value;
      } catch (e) { /* pas de cache disponible */ }

      const loc = locale();
      const list = parseCities(await fetchDoc('/' + loc + '/cities'), loc);
      try {
        await chrome.storage.local.set({ [CITIES_KEY]: { at: Date.now(), value: list } });
      } catch (e) { /* non bloquant */ }
      return list;
    })().catch(() => []);
    return citiesPromise;
  }

  // Pas de sélection mémorisée : on part de la ville regardée, et d'elle seule.
  const startingPick = () => (citySlug() ? [citySlug()] : []);

  /* ------------------------------------------------------------- filtres */

  const WHEN = [
    ['all', 'Tout'],
    ['tonight', 'Ce soir'],
    ['tomorrow', 'Demain'],
    ['weekend', 'Week-end'],
    ['week', '7 jours']
  ];

  function dayStart(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  // Une soirée à 1 h appartient à la nuit de la veille : « ce soir » va à 6 h.
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

/* Chaque réglage porte son intitulé : sans lui, une rangée de boutons
   n'explique pas ce qu'elle règle. */
.grp { display: flex; align-items: center; gap: 9px; }
.grp-lbl { font-size: 10px; font-weight: 700; letter-spacing: .9px;
  text-transform: uppercase; color: var(--muted); white-space: nowrap; }

/* Sélecteur segmenté, à la place des listes déroulantes : la liste d'un
   <select> est dessinée par le système, on ne peut ni la styler ni y montrer
   l'option active sans l'ouvrir. */
.seg { display: flex; gap: 3px; padding: 3px; background: var(--fill);
  border-radius: var(--rb); }
.seg button { display: inline-flex; align-items: center; gap: 6px;
  height: 30px; padding: 0 13px; border-radius: 2px;
  font-size: 12px; font-weight: 700; letter-spacing: .7px; text-transform: uppercase;
  color: var(--muted); white-space: nowrap; }
.seg button:hover { color: var(--fg); }
.seg button.on { background: var(--accent); color: #1c1c1c; }
.seg .icon { width: 14px; height: 14px; }

.price { display: flex; align-items: center; gap: 11px; }
.price input { width: 148px; height: 20px; accent-color: var(--accent); cursor: pointer; }
.price .val { font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums;
  min-width: 66px; }
.price .val.all { color: var(--muted); font-weight: 400; }
.price .excl { font-size: 11px; color: var(--muted); max-width: 190px; }

/* Villes retenues */
.cities { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.citychip { display: inline-flex; align-items: center; gap: 7px;
  height: 32px; padding: 0 12px; border-radius: var(--rb);
  background: var(--accent); color: #1c1c1c;
  font-size: 12px; font-weight: 700; letter-spacing: .7px; text-transform: uppercase; }
.citychip.err { background: var(--danger); color: #fff; }
.citychip .num { font-weight: 400; opacity: .75; }
.citychip .rm { display: grid; place-items: center; width: 16px; height: 16px;
  border-radius: 50%; opacity: .6; }
.citychip .rm:hover { opacity: 1; background: rgba(0, 0, 0, .18); }
.citychip .rm .icon { width: 11px; height: 11px; stroke-width: 3; }
.citychip.add { background: none; border: 1px dashed var(--line-strong); color: var(--muted); }
.citychip.add:hover, .citychip.add.on { border-style: solid; border-color: var(--accent);
  color: var(--accent); }
.citychip .spin { width: 11px; height: 11px; border-radius: 50%;
  border: 2px solid rgba(0, 0, 0, .25); border-top-color: #1c1c1c;
  animation: spin .7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .citychip .spin { animation: none; } }

/* Choix d'une ville */
.picker { width: min(420px, 100%); background: #232323; border: 1px solid var(--line);
  border-radius: var(--r); padding: 10px; }
.pick-search { width: 100%; height: 36px; padding: 0 12px; margin-bottom: 8px;
  border-radius: var(--rb); background: var(--fill); border: 1px solid transparent;
  outline: none; font-size: 14px; }
.pick-search:focus { border-color: var(--accent); }
.pick-search::placeholder { color: var(--muted); }
.pick-list { max-height: 240px; overflow-y: auto; display: flex; flex-direction: column; }
.pick-row { display: flex; align-items: center; gap: 10px; width: 100%;
  padding: 8px 10px; border-radius: var(--rb); text-align: left; }
.pick-row:hover { background: var(--fill); }
.pick-row.on { color: var(--accent); }
.pick-row .nm { flex: 1; font-size: 14px; font-weight: 500; }
.pick-row .ct { font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; }
.pick-none { padding: 12px 10px; color: var(--muted); font-size: 13px; }

main { flex: 1 1 auto; overflow-y: auto; overscroll-behavior: contain; padding: 0 24px 48px; }
.day { position: sticky; top: 0; z-index: 2; background: var(--bg); width: max-content;
  padding: 14px 8px 6px 0; font-size: 17px; }

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
.ev .v .city { color: var(--accent); font-size: 10px; font-weight: 700; letter-spacing: .7px;
  text-transform: uppercase; border: 1px solid var(--line); border-radius: 999px;
  padding: 1px 7px; margin-right: 7px; }
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

.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(168px, 1fr)); gap: 8px 12px; }
.grid .ev { flex-direction: column; align-items: stretch; gap: 5px; padding: 0 0 6px; }
.grid .ev:hover, .grid .ev.cur { background: none; }
.grid .ev:hover .thumb, .grid .ev.cur .thumb { outline: 2px solid var(--accent); }
.grid .thumb { width: 100%; aspect-ratio: 16 / 10; height: auto; }
.grid .h { flex: none; color: var(--accent); font-size: 11px; letter-spacing: .3px; }
.grid .g { display: none; }
.grid .p { flex: none; text-align: left; font-size: 13px; }
/* Deux lignes de titre au plus : sans cette borne, une soirée au nom à
   rallonge décale toute sa rangée. */
.grid .t { font-size: 14px; line-height: 1.25; white-space: normal;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.grid .v { font-size: 12px; }

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
      view: 'grid',
      cursor: -1,
      loaded: false,
      // Multi-villes : la sélection, et l'état de chargement de chacune.
      picked: [],
      cityState: new Map(),
      picker: false
    };

    // Sélecteur de villes sur page de ville et accueil ; ailleurs la page porte
    // déjà sa propre liste.
    const cityMode = Boolean(citySlug()) || isHome();

    const { host, root } = SG.surface('quick-view', VIEW_CSS);
    const wrap = el('div', 'sg wrap');
    const header = el('header');
    const main = el('main');
    wrap.append(header, main);
    root.appendChild(wrap);

    const top = el('div', 'top');
    const brand = el('div', 'brand title-font');
    brand.append(el('em', null, 'Better'), document.createTextNode('Shotgun'));
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

    const rowCities = el('div', 'row');
    const pickerBox = el('div', 'picker');
    pickerBox.style.display = 'none';
    const rowWhen = el('div', 'row');
    const rowGenres = el('div', 'row');
    const rows = el('div', 'rows');
    rows.append(rowCities, pickerBox, rowWhen, rowGenres);
    header.append(top, searchBox, rows);

    function chip(label, on, onClick, quiet) {
      const b = el('button', 'chip' + (on ? ' on' : '') + (quiet ? ' chip-quiet' : ''), label);
      b.addEventListener('click', onClick);
      return b;
    }

    function matches(ev, skipPrice) {
      if (state.hideSold && ev.soldOut) return false;

      if (!skipPrice && state.maxPrice !== null) {
        // Sans prix affiché, un événement sort du lot : leur nombre est affiché à
        // côté du curseur plutôt que de disparaître en silence.
        if (ev.price === null) return false;
        if (state.maxPrice === 0 ? ev.price !== 0 : ev.price > state.maxPrice) return false;
      }

      if (state.genres.size && !ev.genres.some((g) => state.genres.has(g))) return false;

      const win = windowFor(state.when);
      if (win && (ev.start < win[0] || ev.start > win[1])) return false;

      if (state.q) {
        const hay = (ev.title + ' ' + (ev.venue || '') + ' ' + ev.genres.join(' ')).toLowerCase();
        // Chaque mot doit être présent, dans n'importe quel ordre.
        if (!state.q.split(/\s+/).every((w) => hay.includes(w))) return false;
      }

      return true;
    }

    function visible() {
      const out = state.all.filter(matches);
      // Sans prix, pas de place naturelle dans un tri par prix : en fin de liste.
      if (state.sort === 'price') {
        out.sort((a, b) => (a.price === null) - (b.price === null) ||
          (a.price - b.price) || (a.start - b.start));
      } else if (state.sort === 'priceDesc') {
        out.sort((a, b) => (a.price === null) - (b.price === null) ||
          (b.price - a.price) || (a.start - b.start));
      }
      return out;
    }

    // Un groupe = son intitulé, puis son réglage.
    function group(label, control) {
      const g = el('div', 'grp');
      g.append(el('span', 'grp-lbl', label), control);
      return g;
    }

    // Sélecteur segmenté : toutes les options visibles, l'active en évidence.
    function segmented(options, current, onPick) {
      const seg = el('div', 'seg');
      for (const o of options) {
        const b = el('button', o.value === current ? 'on' : null);
        if (o.icon) b.appendChild(icon(o.icon));
        b.appendChild(el('span', null, o.label));
        if (o.title) b.title = o.title;
        b.addEventListener('click', () => onPick(o.value));
        seg.appendChild(b);
      }
      return seg;
    }

    // Borne au 95e centile, arrondie à 5 € : le maximum brut tasserait tout le
    // reste dès qu'un billet cher traîne.
    function priceCap() {
      const prices = state.all.map((e) => e.price).filter((p) => p !== null).sort((a, b) => a - b);
      if (!prices.length) return 50;
      const p95 = prices[Math.min(prices.length - 1, Math.floor(prices.length * 0.95))];
      return Math.max(20, Math.ceil(p95 / 5) * 5);
    }

    function priceControl() {
      const cap = priceCap();
      const box = el('div', 'price');

      const input = document.createElement('input');
      input.type = 'range';
      input.min = '0';
      input.max = String(cap);
      input.step = '1';
      // Position haute = aucun filtre : un curseur est toujours quelque part.
      input.value = String(state.maxPrice === null ? cap : state.maxPrice);
      input.title = 'Prix maximum. À fond à droite, aucun filtre.';

      const val = el('div', 'val');
      const excl = el('div', 'excl');

      function label() {
        if (state.maxPrice === null) {
          val.textContent = 'Tout prix';
          val.className = 'val all';
        } else {
          val.textContent = state.maxPrice === 0 ? 'Gratuit' : '≤ ' + state.maxPrice + ' €';
          val.className = 'val';
        }
        const hidden = state.maxPrice === null ? 0
          : state.all.filter((e) => e.price === null && matches(e, true)).length;
        excl.textContent = hidden ? hidden + ' sans prix affiché, écartés' : '';
      }

      input.addEventListener('input', () => {
        const v = Number(input.value);
        state.maxPrice = v >= cap ? null : v;
        label();
        repaintList();
      });

      label();
      box.append(input, val, excl);
      return box;
    }

    // La ville de la page n'a pas de croix : elle ne peut pas être retirée.
    function cityChip(slug, info) {
      const st = state.cityState.get(slug);
      const b = el('button', 'citychip' + (st === 'erreur' ? ' err' : ''));
      b.appendChild(el('span', null, (info && info.name) || slug));

      if (st === 'chargement' || st === 'attente') b.appendChild(el('span', 'spin'));
      else if (st === 'erreur') b.appendChild(el('span', 'num', 'échec'));

      if (slug !== citySlug()) {
        const x = el('span', 'rm');
        x.appendChild(icon('close'));
        x.title = 'Retirer ' + ((info && info.name) || slug);
        x.addEventListener('click', (e) => { e.stopPropagation(); pick(slug, false); });
        b.appendChild(x);
      }
      return b;
    }

    function cityGroup() {
      const box = el('div', 'cities');
      for (const slug of state.picked) {
        box.appendChild(cityChip(slug, state.cityIndex && state.cityIndex.get(slug)));
      }
      // Ouvert, le bouton devient la sortie plutôt qu'une invitation à ajouter.
      const open = state.picker;
      const add = el('button', 'citychip add' + (open ? ' on' : ''));
      add.appendChild(icon(open ? 'close' : 'plus'));
      add.appendChild(el('span', null, open ? 'Fermer' : 'Ville'));
      add.title = open ? 'Fermer la liste des villes' : 'Ajouter une ville';
      add.addEventListener('click', () => { state.picker = !open; buildToolbar(); });
      box.appendChild(add);
      return box;
    }

    // 171 villes : recherche, et classement par nombre d'événements.
    function buildPicker() {
      pickerBox.replaceChildren();
      if (!state.picker) { pickerBox.style.display = 'none'; return; }
      pickerBox.style.display = '';

      const search2 = document.createElement('input');
      search2.type = 'search';
      search2.placeholder = 'Chercher une ville…';
      search2.className = 'pick-search';

      const list = el('div', 'pick-list');

      function fill() {
        const q = search2.value.trim().toLowerCase();
        list.replaceChildren();
        const index = state.cityIndex ? [...state.cityIndex.values()] : [];
        const hits = index
          .filter((c) => !q || c.name.toLowerCase().includes(q))
          .slice(0, 60);
        if (!hits.length) {
          list.appendChild(el('div', 'pick-none', 'Aucune ville.'));
          return;
        }
        for (const c of hits) {
          const on = state.picked.includes(c.slug);
          const b = el('button', 'pick-row' + (on ? ' on' : ''));
          b.appendChild(el('span', 'nm', c.name));
          b.appendChild(el('span', 'ct', c.count === null ? '' : c.count + ' évts'));
          b.addEventListener('click', () => {
            // Choisir referme la liste ; décocher non, on en retire souvent plusieurs.
            if (!on) state.picker = false;
            pick(c.slug, !on);
            buildToolbar();
          });
          list.appendChild(b);
        }
      }

      search2.addEventListener('input', fill);
      fill();
      pickerBox.append(search2, list);
      setTimeout(() => search2.focus(), 0);
    }

    function buildToolbar() {
      rowWhen.replaceChildren();

      if (cityMode) {
        rowCities.style.display = '';
        rowCities.replaceChildren();
        rowCities.appendChild(el('span', 'grp-lbl', 'Villes'));
        rowCities.appendChild(cityGroup());
        buildPicker();
      } else {
        rowCities.style.display = 'none';
        pickerBox.style.display = 'none';
      }

      rowWhen.appendChild(group('Quand', segmented(
        WHEN.map(([value, label]) => ({ value, label })),
        state.when,
        (v) => { state.when = v; paint(); })));

      rowWhen.appendChild(group('Prix', priceControl()));

      rowWhen.appendChild(group('Places', segmented(
        [{ value: false, label: 'Toutes' }, { value: true, label: 'Encore libres' }],
        state.hideSold,
        (v) => { state.hideSold = v; paint(); })));

      rowWhen.appendChild(el('div', 'spacer'));

      rowWhen.appendChild(group('Trier', segmented([
        { value: 'date', label: 'Date' },
        { value: 'price', label: 'Prix ↑', title: 'Prix croissant' },
        { value: 'priceDesc', label: 'Prix ↓', title: 'Prix décroissant' }
      ], state.sort, (v) => { state.sort = v; paint(); })));

      rowWhen.appendChild(group('Voir', segmented([
        { value: 'list', label: 'Liste', icon: 'list' },
        { value: 'grid', label: 'Affiches', icon: 'grid' }
      ], state.view, (v) => { state.view = v; paint(); })));

      // Genres réellement présents dans l'agenda, par fréquence : une taxonomie
      // figée afficherait des filtres qui ne renvoient rien.
      const freq = new Map();
      for (const ev of state.all) {
        for (const g of ev.genres) freq.set(g, (freq.get(g) || 0) + 1);
      }
      const top12 = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);

      rowGenres.replaceChildren();
      if (top12.length) rowGenres.appendChild(el('span', 'grp-lbl', 'Genres'));
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
      const sub = el('div', 'v');
      // Le nom de la ville n'a d'intérêt que si la liste en mélange plusieurs.
      if (state.picked.length > 1 && ev.cityName) {
        sub.appendChild(el('span', 'city', ev.cityName));
      }
      if (ev.venue) sub.appendChild(document.createTextNode(ev.venue));
      if (sub.childNodes.length) mid.appendChild(sub);
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
      repaintList();
    }

    // Le curseur ne repasse pas par paint : reconstruire la barre sous les doigts
    // le relâcherait.
    function repaintList() {
      // Aucune ville retenue : ce n'est pas une recherche infructueuse.
      if (cityMode && !state.picked.length) { invite(); return; }

      const list = visible();
      state.cursor = -1;

      const pending = [...state.cityState.values()]
        .filter((s) => s === 'attente' || s === 'chargement').length;
      count.textContent = list.length + ' / ' + state.all.length + ' événements' +
        (pending ? ' · ' + pending + ' ville' + (pending > 1 ? 's' : '') + ' en cours…' : '');

      // Villes en route : c'est un chargement, pas une recherche infructueuse.
      if (!state.all.length && pending) { loading(); return; }

      main.replaceChildren();

      if (!list.length) {
        const s = el('div', 'state');
        s.appendChild(el('div', null, 'Aucun événement ne correspond à ces filtres.'));
        s.appendChild(chip('Tout réinitialiser', false, reset, true));
        main.appendChild(s);
        return;
      }

      // Le tri par prix casse la chronologie : pas d'intertitres de journée.
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
      if (e.key === 'Escape') {
        // Échap referme d'abord la liste des villes, pas tout l'agenda.
        if (state.picker) { state.picker = false; buildToolbar(); return; }
        hide();
        return;
      }
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

    // Le compteur n'est pas touché : il porte déjà l'avancement des villes.
    function loading() {
      const s = el('div', null);
      for (let i = 0; i < 8; i++) s.appendChild(el('div', 'skel'));
      main.replaceChildren(s);
    }

    function invite() {
      count.textContent = 'Aucune ville sélectionnée';
      const s = el('div', 'state');
      s.appendChild(el('div', null,
        'Choisis une ou plusieurs villes pour composer ton agenda.'));
      s.appendChild(chip('Choisir une ville', false, () => {
        state.picker = true;
        buildToolbar();
      }, true));
      main.replaceChildren(s);
    }

    function empty() {
      count.textContent = '';
      const s = el('div', 'state');
      s.appendChild(el('div', null, 'Aucun événement lisible ici.'));
      main.replaceChildren(s);
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
      // Même point d'accrochage que les autres surfaces.
      if (!host.isConnected) document.documentElement.appendChild(host);
      host.style.display = '';
      document.addEventListener('keydown', onKey, true);
      setTimeout(() => search.focus(), 0);

      if (state.loaded) return;
      state.loaded = true;
      count.textContent = 'Chargement…';
      loading();

      if (!cityMode) {
        // Salle, artiste, festival : la page porte déjà sa liste.
        try {
          state.all = SG.parseDoc(document);
          state.all.length ? paint() : empty();
        } catch (e) { fail(); }
        return;
      }

      state.picked = startingPick();
      reload().catch(fail);
    }

    // Une ville pèse 2,5 Mo : on fusionne et redessine au fil de l'eau, deux
    // requêtes de front, plutôt qu'un écran figé de dix secondes.
    const CONCURRENCY = 2;

    async function reload() {
      // Sélection vide : l'agenda n'est pas introuvable, il n'est pas demandé.
      if (!state.picked.length) {
        state.cityState = new Map();
        state.all = [];
        buildToolbar();
        invite();
        return;
      }

      const merged = new Map();
      const queue = state.picked.slice();

      state.cityState = new Map(queue.map((s) => [s, 'attente']));
      state.all = [];
      paint();

      const index = await cities();
      state.cityIndex = new Map(index.map((c) => [c.slug, c]));
      const nameOf = (slug) => {
        const hit = state.cityIndex.get(slug);
        return hit ? hit.name : slug;
      };
      buildToolbar();

      async function worker() {
        while (queue.length) {
          const slug = queue.shift();
          state.cityState.set(slug, 'chargement');
          buildToolbar();
          try {
            for (const ev of await loadCity(slug, nameOf(slug))) {
              const kept = merged.get(ev.href);
              // Une même soirée peut figurer dans deux zones voisines.
              if (!kept || (!kept.venue && ev.venue)) merged.set(ev.href, ev);
            }
            state.cityState.set(slug, merged.size);
          } catch (e) {
            state.cityState.set(slug, 'erreur');
          }
          state.all = [...merged.values()].sort((a, b) => a.start - b.start);
          state.all.length ? paint() : buildToolbar();
        }
      }

      await Promise.all(Array.from({ length: CONCURRENCY }, worker));
      if (!state.all.length) empty();
    }

    function pick(slug, on) {
      const next = state.picked.filter((s) => s !== slug);
      if (on) next.push(slug);
      // La ville de la page reste dans la sélection ; sur l'accueil, il n'y en a pas.
      const current = citySlug();
      if (current && !next.includes(current)) next.unshift(current);
      state.picked = next;
      reload().catch(fail);
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
