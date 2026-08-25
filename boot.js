// Script de contenu déclaré : c'est lui qui décide quoi afficher, et quand.
//
// Shotgun est une application à navigation côté client. Chrome n'injecte un
// script de contenu qu'au chargement d'un document, jamais lors d'un
// changement de route interne — d'où un `matches` sur tout le site, et un
// aiguillage fait ici, à partir du chemin.
//
// Rien n'est inséré dans le DOM que React possède : chaque surface est un
// Shadow DOM accroché à <html>.
(() => {
  const SG = window.__sg;
  if (!SG || !SG.quickView || SG.booted) return;
  SG.booted = true;

  const el = SG.el;
  const icon = SG.icon;

  const EVENT_RE = /^\/[^/]+\/events\/[^/]+/;
  const LIST_RE = /^\/[^/]+\/(cities|venues|artists|festivals|search)(?:[/?#]|$)/;

  function kindOf(path) {
    if (EVENT_RE.test(path)) return 'event';
    if (LIST_RE.test(path)) return 'list';
    return null;
  }

  /* ------------------------------------------- géocodage inverse (OSM) */

  const NOMINATIM_TIMEOUT_MS = 8000;
  const NOMINATIM_MIN_INTERVAL_MS = 1100; // politique d'usage Nominatim : 1 req/s max
  const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours

  // Nominatim interdit d'envoyer plus d'une requête par seconde et demande de
  // mettre en cache. Le User-Agent n'est pas modifiable depuis fetch(), ces
  // deux mesures sont donc les seules applicables ici.
  async function throttle() {
    const KEY = 'nominatimLastCall';
    let last = 0;
    try {
      last = (await chrome.storage.local.get(KEY))[KEY] || 0;
    } catch (e) { /* storage indisponible : on continue sans throttle */ }

    // Une horloge reculée (changement d'heure système) donnerait une attente
    // absurde : on borne au maximum à l'intervalle nominal.
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
.card { position: fixed; left: 20px; bottom: 20px; z-index: 2147483645;
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

.venue { font-size: 17px; font-weight: 700; line-height: 1.25; }
.venue-sm { color: var(--muted); font-size: 13px; line-height: 1.3;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.addr { color: var(--muted); font-size: 14px; margin-top: 3px; word-break: break-word; }
.note { color: var(--muted); font-size: 13px; line-height: 1.45; margin-top: 10px;
  border-left: 2px solid var(--accent); padding-left: 10px; }
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

  function buildCard(res, onClose) {
    const { host, root } = SG.surface('venue-card', CARD_CSS);
    const card = el('div', 'sg card');
    root.appendChild(card);

    const head = el('div', 'head');
    head.appendChild(icon(res.secret ? 'warn' : 'pin'));
    head.appendChild(el('div', 'lbl title-font' + (res.secret ? ' warn' : ''),
      res.secret ? 'Lieu secret' : 'Lieu'));
    const x = el('button', 'x');
    x.title = 'Masquer';
    x.appendChild(icon('close'));
    x.addEventListener('click', onClose);
    head.appendChild(x);
    card.appendChild(head);

    if (res.secret) {
      card.appendChild(el('div', 'venue', res.city || 'Lieu non divulgué'));
      if (res.postalCode) card.appendChild(el('div', 'addr', res.postalCode));
      card.appendChild(el('div', 'note',
        res.cityCentroid
          ? 'Shotgun ne publie pas l’adresse. Les coordonnées ci-dessous sont le ' +
            'centre-ville de référence : elles ne disent rien du lieu réel.'
          : 'Shotgun ne publie pas l’adresse. Les coordonnées ci-dessous sont un ' +
            'point générique de la ville, pas celui de la soirée.'));
    } else if (res.venue) {
      // Sur un lieu public, la page affiche déjà le nom de la salle et
      // l'adresse complète. Les répéter masquerait du contenu pour rien : la
      // carte se limite à ce qui manque, les coordonnées et les liens.
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

    // Le géocodage inverse n'a de sens que sur des coordonnées réelles : sur un
    // point générique il renverrait une adresse plausible mais inventée. Il
    // part sur demande, jamais tout seul : c'est la seule requête de
    // l'extension vers un tiers.
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

        // Les liens sont reconstruits à partir du seul identifiant validé côté
        // extraction, jamais d'une URL brute lue dans la page.
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
    b.append(icon('list'), el('span', null, 'Agenda complet'));
    b.addEventListener('click', onOpen);
    root.appendChild(b);
    return host;
  }

  /* -------------------------------------------------------- montage */

  let mounted = [];
  let view = null;
  let retry = null;

  function unmount() {
    clearTimeout(retry);
    retry = null;
    for (const h of mounted) h.remove();
    mounted = [];
    if (view) { view.destroy(); view = null; }
  }

  function mountList() {
    view = SG.quickView.create();
    const launcher = buildLauncher(() => {
      launcher.style.display = 'none';
      view.show({ onHide: () => { launcher.style.display = ''; } });
    });
    document.documentElement.appendChild(launcher);
    mounted.push(launcher);
  }

  // Après une navigation côté client, React réécrit le JSON-LD de la page.
  // S'il n'est pas encore là, on repasse : trois essais suffisent, et l'absence
  // définitive de données n'affiche rien plutôt qu'une carte vide.
  function mountEvent(attempt = 0) {
    const res = SG.readEvent();
    if (!res || !res.found) {
      if (attempt < 3) retry = setTimeout(() => mountEvent(attempt + 1), 400);
      return;
    }
    const card = buildCard(res, () => {
      card.remove();
      mounted = mounted.filter((h) => h !== card);
    });
    document.documentElement.appendChild(card);
    mounted.push(card);
  }

  function mount() {
    const kind = kindOf(location.pathname);
    if (kind === 'event') mountEvent();
    else if (kind === 'list') mountList();
  }

  /* ------------------------------------------------------ navigation */

  // Un script de contenu vit dans un monde isolé : il ne peut pas surveiller
  // le `history.pushState` que la page appelle dans le sien, et `popstate` ne
  // couvre que les boutons précédent/suivant. Une navigation modifie forcément
  // le DOM : c'est ce signal-là qu'on écoute.
  let lastPath = location.pathname;
  let timer = null;

  const observer = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (location.pathname === lastPath) return;
      lastPath = location.pathname;
      unmount();
      mount();
    }, 250);
  });

  observer.observe(document.body, { childList: true, subtree: true });
  mount();

  // Point d'entrée pour le popup, qui reste utilisable si le script de contenu
  // n'a pas encore été injecté dans un onglet ouvert avant l'installation.
  SG.openQuickView = () => {
    if (!view) {
      view = SG.quickView.create();
    }
    view.show({});
  };

  // Appelé par la version suivante quand l'extension est rechargée sous un
  // onglet déjà ouvert : sans cela, l'observateur de cette version-ci
  // continuerait de tourner et de monter des surfaces en concurrence.
  SG.teardown = () => {
    observer.disconnect();
    clearTimeout(timer);
    unmount();
    if (window.__sg === SG) delete window.__sg;
  };
})();
