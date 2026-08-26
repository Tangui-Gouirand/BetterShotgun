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

  // Point de rupture de Tailwind : au-dessus, la bannière est une rangée et le
  // reste s'étale. En dessous tout s'empile, et la moitié de nos réglages n'a
  // plus de sens — voire nuit.
  const MQ = window.matchMedia('(min-width: 768px)');
  const wide = () => MQ.matches;

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

    restyle(h1, { fontSize: wide() ? '22px' : '19px', lineHeight: '1.15' }, undos);

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
    // En dessous du point de rupture la bannière est une colonne : borner
    // l'affiche et écarter les blocs n'aurait aucun sens, ou les éloignerait
    // verticalement.
    if (!wide()) return;

    const affiche = [...banner.children]
      .find((c) => c !== col && c.getBoundingClientRect().height > 200);
    if (!affiche) return;
    restyle(affiche, { maxWidth: '440px' }, undos);

    // La rangée est en `row-reverse` et empile au début, donc à droite :
    // rétrécir l'affiche laissait le vide à gauche et poussait le texte vers
    // le centre. `space-between` le ramène contre le bord.
    restyle(banner, { justifyContent: 'space-between' }, undos);
  }

  /* --------------------------------------------------------- line up */

  // Des vignettes de 135 px pour des visages : 97 suffisent, et la rangée en
  // accueille sept au lieu de cinq.
  function compactLineup(undos) {
    const head = [...document.querySelectorAll('div, h2, h3')].find((n) =>
      !n.children.length && /^line ?up$/i.test((n.textContent || '').trim()));
    const grille = head && head.parentElement && head.parentElement.children[1];
    if (!grille || getComputedStyle(grille).display !== 'grid') return;

    restyle(head, { fontSize: '18px', marginBottom: '8px' }, undos);
    restyle(grille, {
      gridTemplateColumns: 'repeat(auto-fill, minmax(' + (wide() ? 84 : 72) + 'px, 1fr))',
      gap: '10px'
    }, undos);
  }

  /* --------------------------------------------------- organisateurs */

  // Les organisateurs s'empilent dans une colonne de 320 px et coûtent 204 px
  // de hauteur pour deux lignes. Mis côte à côte, ils tiennent en 122.
  function inlineOrganisers(undos) {
    const bloc = [...document.querySelectorAll('div')]
      .find((d) => /\bmd:w-80\b/.test(d.getAttribute('class') || ''));
    if (!bloc || bloc.children.length < 2) return;

    restyle(bloc, {
      display: 'flex', flexWrap: 'wrap', alignItems: 'center',
      columnGap: '24px', rowGap: '8px', width: 'auto', maxWidth: 'none'
    }, undos);
    // L'intitulé garde sa ligne, les organisateurs se partagent la suivante.
    restyle(bloc.children[0], { flexBasis: '100%', marginBottom: '2px', fontSize: '18px' }, undos);
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
      ['organisateurs', () => inlineOrganisers(undos)],
      ['line up', () => compactLineup(undos)],
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
.launch { position: fixed; z-index: 2147483645; height: 40px; padding: 0 16px;
  font-size: 12px; box-shadow: 0 6px 22px rgba(0, 0, 0, .45); }
/* Dans l'en-tête : même sobriété que « Explorer », l'accent sur la seule
   icône. Le libellé ne tiendrait pas dans la place disponible. */
.launch.dock { width: 40px; padding: 0; background: none; color: var(--fg);
  box-shadow: none; }
.launch.dock:hover { background: var(--fill); }
.launch.dock .icon { width: 18px; height: 18px; color: var(--accent); }
.launch.dock .lbl { display: none; }
/* Repli : en-tête absent, plein, ou sorti de l'écran. */
.launch.coin { right: 20px; bottom: 20px; left: auto; top: auto; }
@media (max-width: 900px) { .launch.coin .lbl { display: none; } .launch.coin { padding: 0 12px; } }
`;

  // On se range après le dernier élément du groupe de gauche — le bouton
  // « Explorer » — et non contre la barre de recherche, qui n'est pas le
  // dernier : s'y coller passait par-dessus lui.
  const LARGEUR_DOCK = 40;
  const MARGE_DOCK = 12;

  function placeDock() {
    const head = document.querySelector('header');
    if (!head || head.children.length < 2) return null;
    const gauche = head.children[0];
    const droite = head.children[head.children.length - 1];
    const ancre = gauche.children[gauche.children.length - 1];
    if (!ancre) return null;

    const a = ancre.getBoundingClientRect();
    const d = droite.getBoundingClientRect();
    if (a.bottom < 0 || a.top > window.innerHeight) return null;

    const libre = d.left - a.right;
    if (libre < LARGEUR_DOCK + MARGE_DOCK * 2) return null;
    return { left: Math.round(a.right + MARGE_DOCK), top: Math.round(a.top + (a.height - 40) / 2) };
  }

  // Le bouton se range contre la barre de recherche du site plutôt que de
  // flotter dans un coin. L'en-tête n'est pas fixe : il défile, donc on suit.
  function buildLauncher(onOpen) {
    const { host, root } = SG.surface('quick-view-launcher', LAUNCH_CSS);
    const b = el('button', 'sg btn btn-accent launch coin');
    b.title = 'Recherche avancée dans l’agenda';
    b.append(icon('advSearch'), el('span', 'lbl', 'BetterShotgun'));
    b.addEventListener('click', onOpen);
    root.appendChild(b);

    let queued = false;
    function place() {
      queued = false;
      const pos = placeDock();
      if (!pos) {
        b.classList.remove('dock');
        b.classList.add('coin');
        b.style.left = '';
        b.style.top = '';
        return;
      }
      b.classList.remove('coin');
      b.classList.add('dock');
      b.style.left = pos.left + 'px';
      b.style.top = pos.top + 'px';
    }
    const follow = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(place);
    };
    window.addEventListener('scroll', follow, { passive: true });
    window.addEventListener('resize', follow);
    host.__detach = () => {
      window.removeEventListener('scroll', follow);
      window.removeEventListener('resize', follow);
    };

    setTimeout(place, 0);
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
    for (const h of hosts) {
      if (typeof h.__detach === 'function') h.__detach();
      h.remove();
    }
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

  let eventUndo = null;

  function applyEvent(res) {
    // Toujours défaire d'abord : une seconde passe par-dessus la première
    // sauvegarderait des styles déjà modifiés comme état d'origine.
    if (eventUndo) {
      try { eventUndo(); } catch (e) { /* déjà défait */ }
      eventUndo = null;
    }
    eventUndo = enhanceEvent(res);
    const h1 = document.querySelector('h1');
    if (h1 && eventUndo) h1.setAttribute(SENTINEL, '1');
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

    // Nos styles sont en ligne : aucune règle média ne les suit. Au
    // franchissement du point de rupture, on refait la passe.
    const surRupture = () => { note('changement de largeur'); applyEvent(res); };
    MQ.addEventListener('change', surRupture);

    restores.push(() => {
      obs.disconnect();
      clearTimeout(timer);
      MQ.removeEventListener('change', surRupture);
      if (eventUndo) { eventUndo(); eventUndo = null; }
    });
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
