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


  /* ------------------------------------------- carte de la page */

  const GHOST_RE = /\u{1F47B}/u;
  const ZOOM_MIN = 9;
  const ZOOM_MAX = 18;
  const ZOOM_DEFAULT = 15;

  const MAP_CSS = `
.zoom { position: fixed; z-index: 2147483644; display: flex; align-items: center;
  gap: 2px; padding: 2px; background: rgba(28, 28, 28, .92);
  border: 1px solid var(--line); border-radius: var(--rb); }
.zoom button { width: 28px; height: 28px; display: grid; place-items: center;
  border-radius: 2px; color: var(--fg); }
.zoom button:hover:not(:disabled) { background: var(--fill); }
.zoom button:disabled { opacity: .35; cursor: default; }
.zoom .icon { width: 14px; height: 14px; }
.zoom .lvl { min-width: 28px; text-align: center; font-size: 11px; font-weight: 700;
  color: var(--muted); font-variant-numeric: tabular-nums; }
`;

  // La page porte déjà sa carte : on réécrit ses paramètres plutôt que d'en
  // ajouter une. Sur un lieu secret le flou est une classe CSS, qu'un `filter`
  // en ligne neutralise — la coordonnée, elle, était déjà publique.
  function enhanceMap(res, undos) {
    const img = [...document.querySelectorAll('img')]
      .find((i) => /\/api\/maps\/static/.test(i.getAttribute('src') || ''));
    if (!img) return;

    const src0 = img.getAttribute('src');
    undos.push(() => img.setAttribute('src', src0));
    restyle(img, { filter: 'none' }, undos);

    // Sur un lieu secret, Shotgun pose un fantôme par-dessus la carte. Ce n'est
    // pas le marqueur : l'image renvoyée par l'API en porte déjà un, simple.
    const ghost = [...document.querySelectorAll('div')].find((n) =>
      !n.children.length && GHOST_RE.test(n.textContent || '') &&
      getComputedStyle(n).position === 'absolute');
    if (ghost) restyle(ghost, { display: 'none' }, undos);

    let zoom = ZOOM_DEFAULT;
    function applySrc() {
      const u = new URL(img.getAttribute('src'), location.origin);
      u.searchParams.set('zoom', String(zoom));
      u.searchParams.set('hidden', 'false');
      u.searchParams.set('marker', 'true');
      img.setAttribute('src', u.pathname + '?' + u.searchParams.toString());
    }

    // Les boutons restent hors du DOM de la page, en position fixe recalée sur
    // la carte : React ne réconcilie pas ce qu'il n'a pas rendu.
    const { host, root } = SG.surface('map-zoom', MAP_CSS);
    const ctrl = el('div', 'sg zoom');
    const out = el('button');
    out.appendChild(icon('minus'));
    out.title = 'Dézoomer';
    const lvl = el('div', 'lvl');
    const inn = el('button');
    inn.appendChild(icon('plus'));
    inn.title = 'Zoomer';
    ctrl.append(out, lvl, inn);
    root.appendChild(ctrl);

    function paint() {
      lvl.textContent = 'z' + zoom;
      out.disabled = zoom <= ZOOM_MIN;
      inn.disabled = zoom >= ZOOM_MAX;
    }
    out.addEventListener('click', () => {
      zoom = Math.max(ZOOM_MIN, zoom - 1);
      paint();
      applySrc();
    });
    inn.addEventListener('click', () => {
      zoom = Math.min(ZOOM_MAX, zoom + 1);
      paint();
      applySrc();
    });

    let queued = false;
    function place() {
      queued = false;
      const r = img.getBoundingClientRect();
      const visible = r.width > 0 && r.bottom > 0 && r.top < window.innerHeight;
      ctrl.style.display = visible ? '' : 'none';
      if (!visible) return;
      ctrl.style.left = Math.round(r.right - ctrl.offsetWidth - 8) + 'px';
      ctrl.style.top = Math.round(r.top + 8) + 'px';
    }
    const follow = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(place);
    };
    window.addEventListener('scroll', follow, { passive: true });
    window.addEventListener('resize', follow);
    undos.push(() => {
      window.removeEventListener('scroll', follow);
      window.removeEventListener('resize', follow);
      host.remove();
    });

    paint();
    applySrc();
    ANCHOR().appendChild(host);
    place();
  }

  /* ------------------------------------------------------- bannière */

  // La rangée de tête fait 412 px. Sa hauteur est celle de la plus haute de ses
  // deux colonnes : tant que le texte dépasse, réduire l'affiche ne rend rien,
  // et l'inverse aussi. Les deux ne paient qu'ensemble.
  function compactBanner(undos) {
    const h1 = document.querySelector('h1');
    if (!h1) return;
    const col = h1.parentElement && h1.parentElement.parentElement;
    const banner = col && col.parentElement;
    if (!col || !banner) return;

    restyle(h1, { fontSize: '22px', lineHeight: '1.15' }, undos);

    // Chaque fait — date, salle, adresse — occupe une ligne à `py-4`.
    const infos = [...col.children]
      .find((c) => /max-w-96/.test(c.getAttribute('class') || ''));
    if (infos) {
      restyle(infos, { marginTop: '6px', fontSize: '13px' }, undos);
      for (const ligne of infos.children) {
        restyle(ligne, { gap: '10px' }, undos);
        for (const c of ligne.children) {
          restyle(c, { paddingTop: '6px', paddingBottom: '6px' }, undos);
        }
      }
    }

    // Sur la largeur, pas sur la hauteur : l'affiche est en `object-cover`,
    // et la borner en hauteur la rognerait au lieu de la réduire.
    const affiche = [...banner.children]
      .find((c) => c !== col && c.getBoundingClientRect().height > 200);
    if (affiche) restyle(affiche, { maxWidth: '440px' }, undos);
  }

  /* --------------------------------------- enrichissement de la page */

  // Tout se passe désormais dans la page de Shotgun, sans surface flottante.
  // Chaque étape est annulable et isolée : l'échec de l'une ne doit pas priver
  // des autres.
  function enhanceEvent(res) {
    const undos = [];
    const etapes = [
      ['carte', () => enhanceMap(res, undos)],
      ['bannière', () => compactBanner(undos)],
      ['billets', () => {
        const u = compactTickets();
        if (u) undos.push(u);
      }],
      ['à propos', () => {
        const u = foldAbout();
        if (u) undos.push(u);
      }]
    ];

    for (const [nom, fn] of etapes) {
      try {
        fn();
        note(nom + ' : appliqué');
      } catch (e) {
        note(nom + ' : impossible');
      }
    }

    if (!undos.length) return null;
    return () => {
      for (const u of undos) {
        try { u(); } catch (e) { /* déjà défait */ }
      }
    };
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
  // `load` ne dit pas que l'hydratation est finie : React 18 hydrate en
  // concurrence, et toucher au DOM pendant qu'elle tourne la fait échouer —
  // elle jette alors le HTML du serveur et re-rend tout, emportant nos styles.
  // On attend donc que le DOM cesse de bouger, pas que la page soit chargée.
  const CALME_MS = 700;
  const GARDE_FOU_MS = 8000;

  function whenSettled(fn) {
    let done = false;
    const once = (why) => {
      if (done) return;
      done = true;
      note('montage déclenché', { par: why });
      fn();
    };

    let timer = null;
    const obs = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => { obs.disconnect(); once('DOM stabilisé'); }, CALME_MS);
    });
    obs.observe(document.body, { childList: true, subtree: true });
    timer = setTimeout(() => { obs.disconnect(); once('DOM déjà calme'); }, CALME_MS);
    setTimeout(() => { obs.disconnect(); once('garde-fou'); }, GARDE_FOU_MS);
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

  /* ------------------------------------------------- cases de billets */

  const PRICE_RE = /\d+[,.]\d{2}\s*€|\bgratuit\b|\bfree\b/i;
  const SOLD_RE = /\b(épuisé|complet|sold\s?out|esgotado)\b/i;

  // Applique un style en gardant de quoi revenir en arrière.
  function restyle(node, styles, undos) {
    const saved = node.getAttribute('style');
    Object.assign(node.style, styles);
    undos.push(() => {
      if (saved === null) node.removeAttribute('style');
      else node.setAttribute('style', saved);
    });
  }

  // Une case de billet fait 240 px, dont la moitié pour un descriptif que
  // personne ne lit deux fois. Marges resserrées, descriptif borné à deux
  // lignes et dépliable au clic, catégories épuisées estompées.
  // Le conteneur dont tous les enfants portent un prix : c'est la liste des
  // catégories, qu'aucune classe ne désigne.
  function findTicketList() {
    return [...document.querySelectorAll('div')].find((c) => {
      const kids = [...c.children];
      if (kids.length < 2 || kids.length > 12) return false;
      return kids.every((k) => PRICE_RE.test(k.textContent || '') &&
        k.getBoundingClientRect().height > 60);
    }) || null;
  }

  function compactTickets() {
    const list = findTicketList();
    if (!list) return null;

    const undos = [];
    restyle(list, { display: 'flex', flexDirection: 'column', gap: '6px' }, undos);

    for (const card of list.children) {
      // Un seul appel : deux `restyle` sur le même nœud feraient capturer à la
      // seconde sauvegarde un style déjà modifié.
      const sold = SOLD_RE.test(card.textContent || '');
      restyle(card, sold ? { padding: '9px 12px', opacity: '.55' }
        : { padding: '9px 12px' }, undos);

      const titre = card.querySelector('h3');
      if (titre) restyle(titre, { fontSize: '14px' }, undos);

      // La rangée prix + quantité porte un `mt-4` qui creuse la case.
      const rangee = [...card.querySelectorAll('div')]
        .find((d) => /\bmt-4\b/.test(d.getAttribute('class') || ''));
      if (rangee) restyle(rangee, { marginTop: '6px' }, undos);

      const desc = card.querySelector('[class*="whitespace-pre-line"]');
      if (!desc || desc.getBoundingClientRect().height < 24) continue;

      let open = false;
      const fold = () => {
        Object.assign(desc.style, open ? {
          display: '', webkitLineClamp: '', webkitBoxOrient: '', overflow: '',
          fontSize: '12px', marginTop: '2px', cursor: 'pointer'
        } : {
          display: '-webkit-box', webkitLineClamp: '1', webkitBoxOrient: 'vertical',
          overflow: 'hidden', fontSize: '12px', marginTop: '2px', cursor: 'pointer'
        });
      };
      const saved = desc.getAttribute('style');
      undos.push(() => {
        if (saved === null) desc.removeAttribute('style');
        else desc.setAttribute('style', saved);
      });

      // La case entière est cliquable et mène à l'achat : le clic sur le
      // descriptif doit s'arrêter là, sinon déplier un texte lance la commande.
      // `mousedown` est arrêté aussi, certains gabarits agissant dès l'appui.
      desc.title = 'Cliquer pour tout lire';
      const swallow = (e) => { e.preventDefault(); e.stopPropagation(); };
      desc.addEventListener('mousedown', swallow);
      desc.addEventListener('click', (e) => {
        swallow(e);
        open = !open;
        fold();
      });
      fold();
    }

    if (!undos.length) return null;
    return () => { for (const fn of undos) fn(); };
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
  // puis rien plutôt qu'une page à moitié transformée.
  function mountEvent(attempt = 0) {
    const res = SG.readEvent();
    if (!res || !res.found) {
      note('lieu introuvable', { attempt });
      if (attempt < 3) retry = setTimeout(() => mountEvent(attempt + 1), 400);
      return;
    }
    applyEvent(res);
    watchEvent(res);
    note('page enrichie', { attempt, secret: res.secret });
  }

  // Marqueur de présence : si la page re-rend, il disparaît avec le nœud.
  const SENTINEL = 'data-sg-on';
  const REAPPLY_MAX = 4;

  function applyEvent(res) {
    const undo = enhanceEvent(res);
    if (!undo) return;
    restores.push(undo);
    const h1 = document.querySelector('h1');
    if (h1) h1.setAttribute(SENTINEL, '1');
  }

  // Shotgun peut re-rendre toute la page — son hydratation échoue sur certaines
  // fiches. Nos styles partent avec les nœuds recréés : on les repose.
  function watchEvent(res) {
    let left = REAPPLY_MAX;
    let timer = null;
    const obs = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const h1 = document.querySelector('h1');
        if (!h1 || h1.hasAttribute(SENTINEL)) return;
        if (left-- <= 0) { obs.disconnect(); note('ré-application abandonnée'); return; }
        note('page re-rendue, on repose');
        applyEvent(res);
      }, CALME_MS);
    });
    obs.observe(document.body, { childList: true, subtree: true });
    restores.push(() => { obs.disconnect(); clearTimeout(timer); });
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
