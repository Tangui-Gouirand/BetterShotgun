// Script de contenu déclaré : décide quoi afficher, selon le chemin.
// `matches` couvre tout le site parce que Chrome n'injecte qu'au chargement
// d'un document, et Shotgun change de route sans en recharger un.
(() => {
  const SG = window.__sg;
  if (!SG || !SG.quickView || SG.booted) return;
  SG.booted = true;

  const el = SG.el;
  const icon = SG.icon;

  const EVENT_RE = /^\/[^/]+\/events\/[^/]+/;
  const LIST_RE = /^\/[^/]+\/(cities|venues|artists|festivals|search)(?:[/?#]|$)/;
  const LOCALE_RE = /^[a-z]{2}(-[a-z]{2})?$/i;
  // Accueil : « / », « /fr », « /pt-BR ». Sélection de villes vide au départ.
  const HOME_RE = /^\/(?:[a-z]{2}(?:-[a-z]{2})?)?\/?$/i;

  function kindOf(path) {
    if (EVENT_RE.test(path)) return 'event';
    if (LIST_RE.test(path) || HOME_RE.test(path)) return 'list';
    return null;
  }

  /* ------------------------------------------- géocodage inverse (OSM) */

  const NOMINATIM_TIMEOUT_MS = 8000;
  const NOMINATIM_MIN_INTERVAL_MS = 1100; // politique d'usage Nominatim : 1 req/s max
  const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours

  // Nominatim : une requête par seconde au plus, et cache obligatoire.
  async function throttle() {
    const KEY = 'nominatimLastCall';
    let last = 0;
    try {
      last = (await chrome.storage.local.get(KEY))[KEY] || 0;
    } catch (e) { /* storage indisponible : on continue sans throttle */ }

    // Horloge reculée : on borne à l'intervalle nominal.
    const wait = Math.min(last + NOMINATIM_MIN_INTERVAL_MS - Date.now(), NOMINATIM_MIN_INTERVAL_MS);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));

    try {
      await chrome.storage.local.set({ [KEY]: Date.now() });
    } catch (e) { /* non bloquant */ }
  }

  async function reverseGeocode(lat, lon) {
    const key = 'rev:' + lat.toFixed(5) + ',' + lon.toFixed(5);

    try {
      const cached = (await chrome.storage.local.get(key))[key];
      if (cached && cached.at && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;
    } catch (e) { /* pas de cache disponible */ }

    await throttle();

    const url = 'https://nominatim.openstreetmap.org/reverse?format=jsonv2' +
      '&lat=' + encodeURIComponent(lat) +
      '&lon=' + encodeURIComponent(lon) +
      '&zoom=18&addressdetails=1';

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), NOMINATIM_TIMEOUT_MS);
    try {
      const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: ctrl.signal });
      if (r.status === 429 || r.status === 403) return { error: 'rate' };
      if (!r.ok) return { error: 'http' };

      const j = await r.json();
      const name = (j && typeof j.display_name === 'string') ? j.display_name : null;
      const result = name ? { name } : { error: 'empty' };

      try {
        await chrome.storage.local.set({ [key]: { at: Date.now(), value: result } });
      } catch (e) { /* non bloquant */ }
      return result;
    } catch (e) {
      return { error: ctrl.signal.aborted ? 'timeout' : 'network' };
    } finally {
      clearTimeout(timer);
    }
  }

  const GEOCODE_ERRORS = {
    rate: 'Service d’adresses saturé, réessaie dans un instant.',
    http: 'Le service d’adresses a renvoyé une erreur.',
    empty: 'Aucune adresse connue pour ce point.',
    timeout: 'Le service d’adresses n’a pas répondu à temps.',
    network: 'Impossible de contacter le service d’adresses.'
  };

  /* ------------------------------------------------- carte « lieu » */

  const CARD_CSS = `
.card { position: fixed; right: 20px; bottom: 20px; z-index: 2147483645;
  width: min(380px, calc(100vw - 40px)); max-height: calc(100vh - 40px); overflow-y: auto;
  background: var(--bg); border: 1px solid var(--line); border-radius: var(--r);
  box-shadow: 0 10px 40px rgba(0, 0, 0, .55); padding: 16px; }
.head { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.head .icon { color: var(--accent); }
.head .lbl { flex: 1; font-size: 12px; letter-spacing: .7px; }
.head .lbl.warn { color: var(--accent); }
.x { width: 28px; height: 28px; border-radius: var(--rb); color: var(--muted);
  display: grid; place-items: center; }
.x:hover { background: var(--fill); color: var(--fg); }
.x .icon { width: 15px; height: 15px; color: currentColor; }

/* Repli de la carte : fermer ne la fait pas disparaître, sinon il faudrait
   recharger la page pour la revoir. */
.tab { position: fixed; right: 20px; bottom: 20px; z-index: 2147483645;
  width: 44px; height: 44px; border-radius: var(--r);
  background: var(--bg); border: 1px solid var(--line);
  box-shadow: 0 8px 28px rgba(0, 0, 0, .5);
  display: grid; place-items: center; color: var(--accent); }
  display: grid; place-items: center; color: var(--accent); }
.tab:hover { border-color: var(--accent); background: #232323; }
.tab .icon { width: 20px; height: 20px; }

.venue { font-size: 17px; font-weight: 700; line-height: 1.25; }
.venue-sm { color: var(--muted); font-size: 13px; line-height: 1.3;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.addr { color: var(--muted); font-size: 14px; margin-top: 3px; word-break: break-word; }
.note { color: var(--muted); font-size: 13px; line-height: 1.45; margin-top: 10px;
  border-left: 2px solid var(--accent); padding-left: 10px; }
.mapbox { position: relative; margin-top: 12px; }
.map { display: block; width: 100%; height: auto;
  border: 1px solid var(--line); border-radius: var(--rb); background: var(--fill); }
/* En haut : l'attribution Google occupe le bas et doit rester lisible. */
.zoom { position: absolute; right: 8px; top: 8px; display: flex; align-items: center;
  gap: 2px; padding: 2px; background: rgba(28, 28, 28, .9);
  border: 1px solid var(--line); border-radius: var(--rb); }
.zoom button { width: 26px; height: 26px; display: grid; place-items: center;
  border-radius: 2px; color: var(--fg); }
.zoom button:hover:not(:disabled) { background: var(--fill); }
.zoom button:disabled { opacity: .35; cursor: default; }
.zoom .icon { width: 14px; height: 14px; }
.zoom .lvl { min-width: 26px; text-align: center; font-size: 11px; font-weight: 700;
  color: var(--muted); font-variant-numeric: tabular-nums; }
.mapcap { color: var(--muted); font-size: 11px; line-height: 1.4; margin-top: 6px; }
.coord { display: flex; align-items: center; gap: 8px; margin-top: 12px;
  background: var(--fill); border-radius: var(--rb); padding: 8px 8px 8px 12px; }
.coord code { flex: 1; font: 500 12px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.mini { height: 30px; padding: 0 12px; border-radius: var(--rb); background: rgba(255,255,255,.14);
  font-size: 11px; font-weight: 700; letter-spacing: .7px; text-transform: uppercase; }
.mini:hover { background: rgba(255, 255, 255, .24); }
.mini.done { color: var(--success); }
.acts { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
.acts .btn { flex: 1 1 auto; height: 40px; font-size: 12px; }
.sect { margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--line);
  font-size: 12px; letter-spacing: .7px; }
.quotes { margin-top: 10px; display: flex; flex-direction: column; gap: 8px; }
.quotes div { color: var(--muted); font-size: 12.5px; line-height: 1.45;
  border-left: 2px solid var(--line); padding-left: 10px; }
.osm { color: var(--muted); font-size: 12.5px; line-height: 1.45; margin-top: 10px; }
`;

  // Sur un lieu non divulgué, Shotgun affiche sa carte à zoom 11, sans
  // libellés et floutée par CSS. Le flou est cosmétique : la coordonnée est en
  // clair dans les données de la page, et c'est elle qu'on redemande au même
  // service, lisible. Rien n'est extrait de plus — seulement rendu.
  const ZOOM_MIN = 9;
  const ZOOM_MAX = 18;
  const ZOOM_DEFAULT = 15;

  function mapImage(res) {
    const seg = location.pathname.split('/')[1] || '';
    const url = (zoom) => '/api/maps/static?' + new URLSearchParams({
      lat: String(res.lat),
      lng: String(res.lon),
      zoom: String(zoom),
      width: '330',
      height: '180',
      marker: 'true',
      hidden: 'false',
      locale: LOCALE_RE.test(seg) ? seg : 'fr'
    }).toString();

    const box = el('div', 'mapbox');
    const img = document.createElement('img');
    img.className = 'map';
    img.loading = 'lazy';
    img.alt = '';

    let zoom = ZOOM_DEFAULT;
    const ctrl = el('div', 'zoom');
    const out = el('button');
    out.appendChild(icon('minus'));
    out.title = 'Dézoomer';
    const lvl = el('div', 'lvl');
    const inn = el('button');
    inn.appendChild(icon('plus'));
    inn.title = 'Zoomer';

    function apply() {
      img.src = url(zoom);
      lvl.textContent = 'z' + zoom;
      out.disabled = zoom <= ZOOM_MIN;
      inn.disabled = zoom >= ZOOM_MAX;
    }
    out.addEventListener('click', () => { zoom = Math.max(ZOOM_MIN, zoom - 1); apply(); });
    inn.addEventListener('click', () => { zoom = Math.min(ZOOM_MAX, zoom + 1); apply(); });

    apply();
    ctrl.append(out, lvl, inn);
    box.append(img, ctrl);
    return box;
  }

  function buildCard(res) {
    const { host, root } = SG.surface('venue-card', CARD_CSS);
    const card = el('div', 'sg card');

    // Bouton réduit, à la place exacte de la carte repliée.
    const tab = el('button', 'sg tab');
    tab.title = res.secret ? 'Afficher le lieu secret' : 'Afficher le lieu';
    tab.appendChild(icon('pin'));
    tab.style.display = 'none';

    root.append(card, tab);

    const head = el('div', 'head');
    head.appendChild(icon(res.secret ? 'warn' : 'pin'));
    head.appendChild(el('div', 'lbl title-font' + (res.secret ? ' warn' : ''),
      res.secret ? 'Lieu secret' : 'Lieu'));
    const x = el('button', 'x');
    x.title = 'Replier';
    x.appendChild(icon('close'));
    x.addEventListener('click', () => {
      card.style.display = 'none';
      tab.style.display = '';
    });
    tab.addEventListener('click', () => {
      tab.style.display = 'none';
      card.style.display = '';
    });
    head.appendChild(x);
    card.appendChild(head);

    if (res.secret) {
      card.appendChild(el('div', 'venue', res.city || 'Lieu non divulgué'));
      if (res.postalCode) card.appendChild(el('div', 'addr', res.postalCode));
      card.appendChild(el('div', 'note',
        res.cityCentroid
          ? 'Shotgun ne publie pas l’adresse. Les coordonnées ci-dessous sont le ' +
            'centre-ville de référence : elles ne disent rien du lieu réel.'
          : 'Shotgun ne publie pas l’adresse, mais il publie ce point. La carte ' +
            'de la page le montre flouté et dézoomé ; le voici lisible.'));

      // Un centre-ville de référence n'apprend rien : pas de carte dans ce cas.
      if (!res.cityCentroid) {
        card.appendChild(mapImage(res));
        card.appendChild(el('div', 'mapcap',
          'Point publié par Shotgun, pas une adresse confirmée.'));
      }
    } else if (res.venue) {
      // La page affiche déjà salle et adresse : on ne montre que ce qui manque.
      card.appendChild(el('div', 'venue-sm', res.venue));
    }

    /* coordonnées + copie */

    const text = res.lat.toFixed(6) + ', ' + res.lon.toFixed(6);
    const coord = el('div', 'coord');
    coord.appendChild(el('code', null, text));
    const copy = el('button', 'mini', 'Copier');
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(text);
        copy.classList.add('done');
        copy.textContent = 'Copié';
        setTimeout(() => { copy.classList.remove('done'); copy.textContent = 'Copier'; }, 1600);
      } catch (e) {
        copy.textContent = 'Échec';
      }
    });
    coord.appendChild(copy);
    card.appendChild(coord);

    /* actions */

    const acts = el('div', 'acts');
    const maps = el('a', 'btn btn-accent');
    // Coordonnées déjà validées comme nombres finis dans les bornes géographiques.
    maps.href = 'https://www.google.com/maps?q=' + res.lat + ',' + res.lon;
    maps.target = '_blank';
    maps.rel = 'noopener noreferrer';
    maps.append(icon('pin'), el('span', null, 'Maps'));
    acts.appendChild(maps);

    // Sur un point générique, l'adresse renvoyée serait inventée. Sur demande
    // seulement : c'est la seule requête vers un tiers.
    if (!res.secret) {
      const check = el('button', 'btn', 'Vérifier (OSM)');
      check.addEventListener('click', async () => {
        check.disabled = true;
        check.textContent = 'Vérification…';
        const geo = await reverseGeocode(res.lat, res.lon);
        check.remove();
        card.appendChild(el('div', 'osm', geo.error
          ? (GEOCODE_ERRORS[geo.error] || GEOCODE_ERRORS.network)
          : 'OpenStreetMap : ' + geo.name));
      });
      acts.appendChild(check);
    }
    card.appendChild(acts);

    /* canal de révélation */

    const g = res.guidance;
    if (res.secret && g) {
      const hasChannel = g.telegram || g.instagram;
      if (!hasChannel && !g.notes.length && !g.hints.length) {
        card.appendChild(el('div', 'osm',
          'La description ne dit pas où l’adresse sera annoncée. Elle part en ' +
          'général aux détenteurs de billets peu avant l’événement.'));
      } else {
        card.appendChild(el('div', 'sect title-font', 'Où l’adresse arrivera'));

        if (g.notes.length) {
          const q = el('div', 'quotes');
          for (const n of g.notes) q.appendChild(el('div', null, n));
          card.appendChild(q);
        }

        // Liens reconstruits depuis l'identifiant validé, jamais une URL brute.
        const chans = el('div', 'acts');
        if (g.telegram) {
          const a = el('a', 'btn');
          a.href = 'https://t.me/' + g.telegram;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.append(icon('send'), el('span', null, 'Telegram'));
          chans.appendChild(a);
        }
        if (g.instagram) {
          const a = el('a', 'btn');
          a.href = 'https://www.instagram.com/' + g.instagram + '/';
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.append(icon('camera'), el('span', null, 'Instagram'));
          chans.appendChild(a);
        }
        if (chans.children.length) card.appendChild(chans);

        if (g.hints.length) {
          card.appendChild(el('div', 'sect title-font', 'Indices de localisation'));
          const q = el('div', 'quotes');
          for (const h of g.hints) q.appendChild(el('div', null, h));
          card.appendChild(q);
        }
      }
    }

    return host;
  }

  /* ------------------------------------------------------- lanceur */

  const LAUNCH_CSS = `
.launch { position: fixed; right: 20px; bottom: 20px; z-index: 2147483645;
  box-shadow: 0 8px 28px rgba(0, 0, 0, .5); }
`;

  function buildLauncher(onOpen) {
    const { host, root } = SG.surface('quick-view-launcher', LAUNCH_CSS);
    const b = el('button', 'sg btn btn-accent launch');
    b.append(icon('list'), el('span', null, 'BetterShotgun'));
    b.addEventListener('click', onOpen);
    root.appendChild(b);
    return host;
  }

  /* -------------------------------------------------------- montage */

  // Journal en mémoire, lisible via `window.__sg.trace`.
  const trace = [];
  const started = performance.now();

  function note(ev, extra) {
    trace.push(Object.assign(
      { t: Math.round(performance.now() - started), ev, path: location.pathname },
      extra));
    if (trace.length > 80) trace.shift();
  }

  let mounted = [];
  let restores = [];
  let view = null;
  let retry = null;

  function unmount() {
    note('unmount', { surfaces: mounted.length });
    clearTimeout(retry);
    retry = null;
    for (const undo of restores) { try { undo(); } catch (e) { /* déjà parti */ } }
    restores = [];
    // Vidé avant le retrait : le réattacheur ignore un démontage volontaire.
    const hosts = mounted;
    mounted = [];
    for (const h of hosts) h.remove();
    if (view) { view.destroy(); view = null; }
  }

  // React (App Router) hydrate `document` et retire les enfants de <html>
  // qu'il ne connaît pas : on attend que la page soit posée pour monter.
  // rAF ne s'exécute pas dans un onglet d'arrière-plan, d'où les minuteurs.
  function whenSettled(fn) {
    let done = false;
    const once = (why) => {
      if (done) return;
      done = true;
      note('montage déclenché', { par: why });
      fn();
    };
    const go = () => {
      requestAnimationFrame(() => requestAnimationFrame(() => once('image')));
      setTimeout(() => once('minuteur'), 1200);
    };
    if (document.readyState === 'complete') go();
    else window.addEventListener('load', go, { once: true });
    setTimeout(() => once('garde-fou'), 4000);
  }

  // Réattache ce qui serait retiré malgré tout, plafonné pour ne pas boucler.
  const MAX_HEALS = 5;
  let heals = 0;

  // Un seul point d'accrochage, et c'est lui qu'on surveille.
  const ANCHOR = () => document.documentElement;

  const healer = new MutationObserver((records) => {
    for (const r of records) {
      for (const n of r.removedNodes) {
        if (!mounted.includes(n)) continue;
        if (++heals > MAX_HEALS) {
          note('réattachement abandonné');
          healer.disconnect();
          return;
        }
        note('surface retirée, réattachée');
        // À l'image suivante : réinsérer pendant le rendu de React le ferait
        // retirer aussitôt.
        requestAnimationFrame(() => ANCHOR().appendChild(n));
      }
    }
  });

  /* ------------------------------------------ « À propos » déployable */

  const ABOUT_RE = /^(à propos|a propos|about|sobre|acerca de)$/i;
  const ABOUT_MAX = 150;

  const FOLD_CSS = `
.fold { display: inline-flex; align-items: center; gap: 7px; height: 34px; padding: 0 14px;
  margin-top: 10px; border-radius: var(--rb); background: var(--fill); color: var(--fg);
  font-size: 12px; font-weight: 700; letter-spacing: .7px; text-transform: uppercase; }
.fold:hover { background: rgba(255, 255, 255, .18); }
.fold .icon { width: 14px; height: 14px; }
`;

  // Les descriptifs font souvent plusieurs écrans et repoussent tout le reste.
  // Seul le corps est replié ; le pied de page a lui aussi un « À propos », que
  // sa longueur et son emplacement permettent d'écarter.
  function foldAbout() {
    const head = [...document.querySelectorAll('div, h2, h3')].find((n) =>
      !n.children.length &&
      ABOUT_RE.test((n.textContent || '').trim()) &&
      !n.closest('footer'));
    if (!head) return null;

    const body = head.parentElement && head.parentElement.children[1];
    if (!body || body === head) return null;
    if ((body.textContent || '').trim().length < 300) return null;
    if (body.getBoundingClientRect().height <= ABOUT_MAX + 60) return null;

    const saved = body.getAttribute('style');
    let open = false;

    const { host, root } = SG.surface('about-fold', FOLD_CSS);
    const btn = el('button', 'sg fold');
    root.appendChild(btn);

    function apply() {
      if (open) {
        body.style.maxHeight = '';
        body.style.overflow = '';
        body.style.maskImage = '';
        body.style.webkitMaskImage = '';
      } else {
        body.style.maxHeight = ABOUT_MAX + 'px';
        body.style.overflow = 'hidden';
        // Dégradé plutôt qu'une coupe nette : la troncature se voit.
        body.style.maskImage = 'linear-gradient(#000 55%, transparent)';
        body.style.webkitMaskImage = body.style.maskImage;
      }
      btn.replaceChildren(icon(open ? 'minus' : 'plus'),
        el('span', null, open ? 'Réduire' : 'Tout afficher'));
    }

    btn.addEventListener('click', () => { open = !open; apply(); });
    apply();
    body.insertAdjacentElement('afterend', host);

    return () => {
      host.remove();
      if (saved === null) body.removeAttribute('style');
      else body.setAttribute('style', saved);
    };
  }

  function mountList() {
    view = SG.quickView.create();
    const launcher = buildLauncher(() => {
      launcher.style.display = 'none';
      view.show({ onHide: () => { launcher.style.display = ''; } });
    });
    ANCHOR().appendChild(launcher);
    mounted.push(launcher);
  }

  // Le JSON-LD peut arriver après une navigation côté client : trois essais,
  // puis rien plutôt qu'une carte vide.
  function mountEvent(attempt = 0) {
    const res = SG.readEvent();
    if (!res || !res.found) {
      note('lieu introuvable', { attempt });
      if (attempt < 3) retry = setTimeout(() => mountEvent(attempt + 1), 400);
      return;
    }
    const card = buildCard(res);
    ANCHOR().appendChild(card);
    mounted.push(card);
    note('carte montée', { attempt, secret: res.secret });

    // Le repli touche au DOM de la page, contrairement au reste : il est donc
    // annulable, et l'échec ne doit pas emporter la carte.
    try {
      const undo = foldAbout();
      if (undo) { restores.push(undo); note('à propos replié'); }
    } catch (e) { note('repli impossible'); }
  }

  function mount() {
    // Plafond par montage, pas pour la durée de vie de l'onglet.
    heals = 0;
    const kind = kindOf(location.pathname);
    note('mount', { kind: kind || 'aucun' });
    if (kind === 'event') mountEvent();
    else if (kind === 'list') mountList();
  }

  /* ------------------------------------------------------ navigation */

  // Un monde isolé ne voit pas le `history.pushState` de la page, et
  // `popstate` ne couvre que précédent/suivant : on écoute le DOM.
  let lastPath = location.pathname;
  let timer = null;

  const observer = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (location.pathname === lastPath) return;
      note('navigation', { de: lastPath });
      lastPath = location.pathname;
      unmount();
      mount();
    }, 250);
  });

  observer.observe(document.body, { childList: true, subtree: true });
  // React réconcilie <html> comme <body>.
  healer.observe(document.documentElement, { childList: true });
  healer.observe(document.body, { childList: true });
  note('démarrage', { readyState: document.readyState, version: SG.version });
  whenSettled(mount);

  // Lecture du journal depuis la console : window.__sg.trace
  SG.trace = trace;

  // Appelé par la version suivante après un rechargement de l'extension.
  SG.teardown = () => {
    observer.disconnect();
    healer.disconnect();
    clearTimeout(timer);
    unmount();
    if (window.__sg === SG) delete window.__sg;
  };
})();
