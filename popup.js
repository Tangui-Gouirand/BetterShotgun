'use strict';

const out = document.getElementById('out');

const EVENT_URL_RE = /^https:\/\/shotgun\.live\/[^/]+\/events\/[^/]+/;
// Pages listant des événements : ville, salle, artiste, festival, recherche.
const LIST_URL_RE = /^https:\/\/shotgun\.live\/[^/]+\/(cities|venues|artists|festivals|search)(?:[/?#]|$)/;
const NOMINATIM_TIMEOUT_MS = 8000;
const NOMINATIM_MIN_INTERVAL_MS = 1100; // politique d'usage Nominatim : 1 req/s max
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours

/* ------------------------------------------------------------------ rendu */

// Tout le contenu affiché vient de la page ou d'une API distante : on ne
// construit jamais de HTML par concaténation, uniquement des nœuds texte.
function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text != null) n.textContent = text;
  return n;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK = 'http://www.w3.org/1999/xlink';

// Les icônes sont des <symbol> déclarés dans popup.html : aucune ressource
// externe, ce qu'impose la CSP des extensions.
function icon(id, cls) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', cls || 'icon');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', '#' + id);
  use.setAttributeNS(XLINK, 'xlink:href', '#' + id);
  svg.appendChild(use);
  return svg;
}

function clear() {
  while (out.firstChild) out.removeChild(out.firstChild);
}

// Écran pleine surface pour les cas « rien à afficher ».
function showMessage(text, iconId) {
  clear();
  const box = el('div', 'state');
  box.appendChild(icon(iconId || 'i-info'));
  box.appendChild(el('p', null, text));
  out.appendChild(box);
}

function addPill(text, kind) {
  const p = el('span', 'pill ' + kind);
  p.appendChild(el('span', 'dot'));
  p.appendChild(el('span', null, text));
  out.appendChild(p);
}

function addTitle(text) {
  out.appendChild(el('div', 'title', text));
}

function addField(label, value) {
  const f = el('div', 'field');
  f.appendChild(el('div', 'label', label));
  f.appendChild(el('div', 'value', value));
  out.appendChild(f);
}

function addCallout(kind, text) {
  const box = el('div', 'callout callout-' + kind);
  box.appendChild(icon(kind === 'warn' ? 'i-warn' : 'i-info'));
  box.appendChild(el('div', null, text));
  out.appendChild(box);
}

function addSectionTitle(text, iconId) {
  out.appendChild(el('div', 'divider'));
  const t = el('div', 'section-title');
  t.appendChild(icon(iconId));
  t.appendChild(el('span', null, text));
  out.appendChild(t);
}

function addQuotes(label, items) {
  const f = el('div', 'field');
  f.appendChild(el('div', 'label', label));
  const ul = el('ul', 'quotes');
  for (const it of items) ul.appendChild(el('li', null, it));
  f.appendChild(ul);
  out.appendChild(f);
}

// Coordonnées en monospace avec copie au presse-papiers.
function addCoords(label, lat, lon) {
  const text = lat.toFixed(6) + ', ' + lon.toFixed(6);
  const f = el('div', 'field');
  f.appendChild(el('div', 'label', label));

  const box = el('div', 'coord');
  box.appendChild(el('code', null, text));

  const btn = el('button', 'copy');
  const paint = (iconId, word) => {
    while (btn.firstChild) btn.removeChild(btn.firstChild);
    btn.appendChild(icon(iconId));
    btn.appendChild(el('span', null, word));
  };
  paint('i-copy', 'Copier');

  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(text);
      btn.classList.add('done');
      paint('i-check', 'Copié');
      setTimeout(() => { btn.classList.remove('done'); paint('i-copy', 'Copier'); }, 1600);
    } catch (e) {
      paint('i-copy', 'Échec');
    }
  });

  box.appendChild(btn);
  f.appendChild(box);
  out.appendChild(f);
}

function addButton(href, label, iconId, kind, trailing) {
  const a = el('a', 'btn btn-' + kind);
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.appendChild(icon(iconId));
  a.appendChild(el('span', null, label));
  if (trailing) a.appendChild(el('span', 'chan', trailing));
  a.appendChild(icon('i-ext'));
  out.appendChild(a);
}

// Variante bouton pour les actions qui s'exécutent dans l'onglet plutôt que
// d'ouvrir un lien.
function addActionButton(label, iconId, kind, onClick) {
  const b = el('button', 'btn btn-' + kind);
  b.appendChild(icon(iconId));
  b.appendChild(el('span', null, label));
  b.addEventListener('click', onClick);
  out.appendChild(b);
  return b;
}

function addMapLink(lat, lon) {
  // Coordonnées déjà validées comme nombres finis dans les bornes géographiques.
  addButton('https://www.google.com/maps?q=' + lat + ',' + lon,
    'Ouvrir dans Google Maps', 'i-pin', 'primary');
}

/* ------------------------------------------------- géocodage inverse (OSM) */

// Nominatim interdit d'envoyer plus d'une requête par seconde et demande de
// mettre en cache. Le User-Agent n'est pas modifiable depuis fetch() (en-tête
// interdit), ces deux mesures sont donc les seules applicables ici.
//
// On utilise `storage.local` et non `storage.session` : `session` n'est pas
// exposé dans tous les contextes, et son absence ferait échouer silencieusement
// la limitation de débit — on croirait respecter la politique Nominatim tout en
// envoyant des requêtes sans frein. `local` est toujours présent dès lors que
// la permission `storage` est déclarée. Le cache survit au redémarrage, ce qui
// est sans inconvénient : l'adresse d'un point fixe ne change pas.
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
  rate: 'Service d’adresses momentanément saturé, réessaie dans un instant.',
  http: 'Le service d’adresses a renvoyé une erreur.',
  empty: 'Aucune adresse connue pour ce point.',
  timeout: 'Le service d’adresses n’a pas répondu à temps.',
  network: 'Impossible de contacter le service d’adresses.'
};

/* --------------------------------------------------------------- lecture  */

// Les scripts sont déclarés dans le manifeste, donc déjà présents sur toute
// page Shotgun. Ils restent injectés ici pour le seul cas qu'un `matches` ne
// couvre pas : un onglet ouvert avant l'installation de l'extension. Les
// bibliothèques se protègent d'une double définition, l'injection est donc
// sans effet quand elles sont déjà là.
const LIB = ['quickview.js', 'event.js'];

async function readPage(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: LIB });
  const frames = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => window.__sg.readEvent()
  });
  const first = Array.isArray(frames) ? frames[0] : null;
  return (first && first.result) || null;
}

/* ------------------------------------------------------------------ écran */

function renderSecret(res) {
  clear();

  addPill('Lieu secret', 'is-secret');
  if (res.title) addTitle(res.title);

  addCallout('warn',
    'Shotgun ne publie pas le lieu réel de cet événement. Les coordonnées ' +
    'ci-dessous sont un point générique de la ville, pas l’adresse de la soirée.');

  if (res.city) {
    addField('Ville annoncée', res.postalCode ? res.city + ' — ' + res.postalCode : res.city);
  }

  addCoords('Coordonnées publiées', res.lat, res.lon);

  if (res.cityCentroid) {
    addCallout('info',
      'Ce point correspond exactement au centre-ville de référence : il ne ' +
      'contient aucune information sur le lieu.');
  } else if (res.postalCode) {
    addCallout('info',
      'Tout au plus, le code postal restreint la zone — sans désigner l’adresse.');
  }

  addMapLink(res.lat, res.lon);
  renderGuidance(res.guidance);
}

// L'adresse n'est pas cachée pour toujours : l'organisateur la communique par
// ses propres canaux, qu'il indique le plus souvent en clair dans la
// description. C'est l'information réellement utile ici.
function renderGuidance(g) {
  if (!g) return;

  const hasChannel = g.telegram || g.instagram;
  if (!hasChannel && !g.notes.length && !g.hints.length) {
    addCallout('info',
      'La description ne précise pas où l’adresse sera annoncée. Elle est en ' +
      'général envoyée aux détenteurs de billets peu avant l’événement.');
    return;
  }

  addSectionTitle('Où l’adresse sera communiquée', 'i-megaphone');

  if (g.notes.length) addQuotes('D’après l’organisateur', g.notes);

  // Les liens sont reconstruits à partir du seul identifiant validé côté
  // extraction, jamais d'une URL brute lue dans la page.
  if (g.telegram) {
    addButton('https://t.me/' + g.telegram, 'Telegram', 'i-send', 'ghost', g.telegram);
  }
  if (g.instagram) {
    addButton('https://www.instagram.com/' + g.instagram + '/',
      'Instagram', 'i-camera', 'ghost', '@' + g.instagram);
  }

  if (g.hints.length) {
    addSectionTitle('Indices de localisation', 'i-compass');
    addQuotes('Repérés dans la description', g.hints);
  }
}

async function renderPublic(res) {
  clear();

  addPill('Lieu public', 'is-public');
  if (res.title) addTitle(res.title);

  if (res.venue) addField('Lieu', res.venue);
  if (res.street) addField('Adresse', res.street);
  if (res.postalCode || res.city) {
    addField('Ville', [res.postalCode, res.city].filter(Boolean).join(' — '));
  }
  addCoords('Coordonnées', res.lat, res.lon);
  addMapLink(res.lat, res.lon);

  // Le géocodage inverse n'a de sens que sur des coordonnées réelles. Sur un
  // point générique il renverrait une adresse plausible mais inventée, c'est
  // pourquoi il n'est lancé que dans cette branche.
  addSectionTitle('Contre-vérification', 'i-compass');
  const pending = el('div', 'field');
  pending.appendChild(el('div', 'label', 'OpenStreetMap'));
  pending.appendChild(el('div', 'skel', ''));
  pending.lastChild.setAttribute('style', 'width:80%;height:13px;margin-top:2px');
  out.appendChild(pending);

  const geo = await reverseGeocode(res.lat, res.lon);
  pending.remove();

  if (geo.error) {
    addCallout('info', GEOCODE_ERRORS[geo.error] || GEOCODE_ERRORS.network);
  } else if (geo.name) {
    addField('Adresse vérifiée (OpenStreetMap)', geo.name);
  }
}

/* --------------------------------------------------- vue rapide (listes) */

// Le bouton « Agenda complet » vit maintenant dans la page. Ce panneau ne sert
// que quand il n'y est pas : onglet ouvert avant l'installation, ou script de
// contenu rechargé.
function renderLauncher(tabId) {
  clear();

  addPill('Page de liste', 'is-public');
  addTitle('Agenda complet');

  addCallout('info',
    'Le bouton se trouve en bas à droite de la page. S’il n’y est pas, ' +
    'l’onglet était ouvert avant l’installation : ce bouton-ci fait la même ' +
    'chose.');

  const btn = addActionButton('Ouvrir l’agenda complet', 'i-grid', 'primary', async () => {
    btn.disabled = true;
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: [...LIB, 'boot.js'] });
      await chrome.scripting.executeScript({
        target: { tabId },
        func: () => window.__sg.openQuickView()
      });
      window.close();
    } catch (e) {
      btn.disabled = false;
      addCallout('warn', 'Injection impossible. Recharge la page puis réessaie.');
    }
  });

  addSectionTitle('Raccourcis', 'i-compass');
  addQuotes('Dans l’agenda', [
    '/ — rechercher',
    '↑ ↓ (ou j / k) — parcourir, Entrée — ouvrir',
    'Échap — fermer'
  ]);
}

/* ------------------------------------------------------------------- flux */

async function run() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = (tab && tab.url) || '';

  if (!tab || !tab.id || !/^https:\/\/shotgun\.live\//.test(url)) {
    showMessage('Ouvre une page Shotgun pour utiliser l’extension.', 'i-pin');
    return;
  }

  if (!EVENT_URL_RE.test(url)) {
    if (LIST_URL_RE.test(url)) {
      renderLauncher(tab.id);
      return;
    }
    showMessage('Ouvre une page d’événement, de ville, de salle ou d’artiste.', 'i-pin');
    return;
  }

  let res;
  try {
    res = await readPage(tab.id);
  } catch (e) {
    res = null;
  }

  if (!res) {
    showMessage('Lecture de la page impossible. Recharge la page puis réessaie.', 'i-warn');
    return;
  }
  if (!res.found) {
    showMessage('Aucune coordonnée dans les données structurées de cette page.', 'i-info');
    return;
  }

  if (res.secret) renderSecret(res);
  else await renderPublic(res);
}

// Aucun chemin ne doit laisser le popup bloqué sur « Analyse… ».
run().catch(() => {
  showMessage('Une erreur inattendue est survenue.', 'i-warn');
});
