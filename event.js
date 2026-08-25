// Lecture du lieu d'une page d'événement, à partir des données structurées
// que le serveur envoie déjà à chaque visiteur. Bibliothèque : aucun effet de
// bord au chargement.
(() => {
  const SG = (window.__sg = window.__sg || {});
  if (SG.readEvent) return;

  // Accepte les nombres comme les chaînes ("48.8566"), les deux se rencontrent en JSON-LD.
  function toCoord(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v === 'string' && v.trim() !== '') {
      const n = Number(v.replace(',', '.'));
      if (Number.isFinite(n)) return n;
    }
    return null;
  }

  function validCoords(lat, lon) {
    return lat !== null && lon !== null &&
      lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 &&
      // 0,0 (Null Island) est une valeur par défaut, jamais un vrai lieu.
      !(lat === 0 && lon === 0);
  }

  const str = (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

  // Parcours récursif : selon la page le bloc utile est dans un tableau, sous
  // @graph, ou imbriqué. On cherche n'importe quel nœud portant un `geo` valide.
  function findGeo(node, depth = 0) {
    if (!node || typeof node !== 'object' || depth > 12) return null;

    if (Array.isArray(node)) {
      for (const item of node) {
        const hit = findGeo(item, depth + 1);
        if (hit) return hit;
      }
      return null;
    }

    const geo = node.geo;
    if (geo && typeof geo === 'object' && !Array.isArray(geo)) {
      const lat = toCoord(geo.latitude);
      const lon = toCoord(geo.longitude);
      if (validCoords(lat, lon)) {
        const addr = (node.address && typeof node.address === 'object' && !Array.isArray(node.address))
          ? node.address : {};
        return {
          lat,
          lon,
          venue: str(node.name),
          street: str(addr.streetAddress),
          postalCode: str(addr.postalCode),
          city: str(addr.addressLocality)
        };
      }
    }

    for (const key of Object.keys(node)) {
      const hit = findGeo(node[key], depth + 1);
      if (hit) return hit;
    }
    return null;
  }

  function eachJsonLd() {
    const out = [];
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        out.push(JSON.parse(s.textContent));
      } catch (e) {
        // un bloc invalide ne doit pas empêcher de lire les suivants
      }
    }
    return out;
  }

  function fromJsonLd() {
    for (const data of eachJsonLd()) {
      const hit = findGeo(data);
      if (hit) return hit;
    }
    return null;
  }

  // Détection du cas « Lieu secret ».
  //
  // Vérifié sur 254 événements Shotgun (août 2026) : les 245 événements publics
  // portent tous une `streetAddress` complète, et les 9 événements affichés
  // « Lieu secret à <Ville> » n'en ont aucune — leur `location.name` vaut le nom
  // de la ville et leurs coordonnées sont un point générique, identique d'un
  // événement à l'autre dans une même ville.
  //
  // L'absence de `streetAddress` est donc le signal fiable ; le nom de lieu égal
  // à la ville le confirme.
  function isSecret(geo) {
    if (!geo.street) return true;
    if (geo.venue && geo.city && geo.venue.toLowerCase() === geo.city.toLowerCase()) return true;
    return false;
  }

  // Centres-villes génériques repérés sur les événements secrets. Y tomber
  // pile signifie que la coordonnée ne porte aucune information sur le lieu.
  const CITY_CENTROIDS = [
    [52.520008, 13.404954],  // Berlin
    [51.509865, -0.118092],  // Londres
    [52.370216, 4.895168],   // Amsterdam
    [48.856614, 2.352222],   // Paris
    [45.764043, 4.835659],   // Lyon
    [43.296482, 5.369780],   // Marseille
    [50.850340, 4.351710],   // Bruxelles
    [41.385064, 2.173404]    // Barcelone
  ];

  function isKnownCentroid(lat, lon) {
    return CITY_CENTROIDS.some(([a, b]) =>
      Math.abs(lat - a) < 0.0005 && Math.abs(lon - b) < 0.0005);
  }

  function eventTitle() {
    const og = document.querySelector('meta[property="og:title"]');
    const c = og && str(og.getAttribute('content'));
    return c || str(document.title);
  }

  /* ------------------------------------------- description de l'événement */

  // La description JSON-LD du nœud Event : c'est là que les organisateurs
  // écrivent en clair comment l'adresse sera communiquée.
  function findDescription(node, depth = 0) {
    if (!node || typeof node !== 'object' || depth > 12) return null;
    if (Array.isArray(node)) {
      for (const it of node) {
        const h = findDescription(it, depth + 1);
        if (h) return h;
      }
      return null;
    }
    if (typeof node['@type'] === 'string' && /Event/i.test(node['@type']) &&
        typeof node.description === 'string' && node.description.trim()) {
      return node.description;
    }
    for (const k of Object.keys(node)) {
      const h = findDescription(node[k], depth + 1);
      if (h) return h;
    }
    return null;
  }

  function eventDescription() {
    for (const data of eachJsonLd()) {
      const hit = findDescription(data);
      if (hit) return hit;
    }
    return null;
  }

  /* ----------------------------------- canal de révélation et indices */

  // Mots-clés relevés sur les descriptions réelles d'événements « Lieu secret ».
  // `meeting point` exige un deux-points : employé seul il sert surtout de
  // métaphore (« a meeting point between rave culture and community »).
  const RX_REVEAL = /will be (announced|revealed|shared|sent|given)|revealed to|announced on|communiqu[ée]|annonc[ée]|d[ée]voil[ée]|envoy[ée] (par|aux)|adresse .{0,25}(donn|transmis|communiqu|envoy)|meeting point\s*[:：]|point de rendez-vous\s*[:：]/i;
  const RX_TRANSIT = /\b(U-?Bahn|S-?Bahn|tram(?:way)?|m[ée]tro|bus|station|arr[êe]t|stop|ligne \d|line \d|quartier|district|nearest)\b/i;

  // Une ligne du type « Nearest tram stop: » porte sa valeur sur la ligne
  // suivante : on recolle les deux, sinon l'indice est vide.
  function lineWithValue(lines, i) {
    const line = lines[i];
    if (/[:：]\s*$/.test(line) && lines[i + 1]) return line + ' ' + lines[i + 1];
    return line;
  }

  // Fenêtre centrée sur le motif trouvé. Couper depuis le début de la ligne
  // perdrait justement l'information utile : dans « … le lieu restera secret et
  // ne sera dévoilé qu'une semaine avant », tout se joue au caractère 120.
  function snippet(line, rx, before = 50, after = 110) {
    const text = line.replace(/\s+/g, ' ').trim();
    const m = text.match(rx);
    if (!m) return text.length > after ? text.slice(0, after - 1) + '…' : text;

    const start = Math.max(0, text.indexOf(m[0]) - before);
    const end = Math.min(text.length, text.indexOf(m[0]) + m[0].length + after);
    return (start > 0 ? '…' : '') + text.slice(start, end).trim() + (end < text.length ? '…' : '');
  }

  function extractGuidance(description) {
    const empty = { telegram: null, instagram: null, notes: [], hints: [] };
    if (!description) return empty;

    // La description est du texte, mais on retire toute balise éventuelle
    // pour ne pas afficher de fragments de balisage.
    const text = description.replace(/<[^>]*>/g, ' ');
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

    // Liens reconstruits à partir du seul identifiant capturé : on n'utilise
    // jamais une URL brute issue de la page comme href.
    const tg = text.match(/t\.me\/([A-Za-z0-9_+][A-Za-z0-9_+\-]{2,31})/i);
    const ig = text.match(/instagram\.com\/([A-Za-z0-9_][A-Za-z0-9_.]{1,29})/i);

    let instagram = ig ? ig[1] : null;
    if (!instagram) {
      // « @pseudo » n'est retenu que si la ligne parle bien d'Instagram :
      // isolé, ce motif attrape surtout des horaires et des e-mails.
      for (const l of lines) {
        if (!/instagram|insta\b|\bIG\b/i.test(l)) continue;
        const m = l.match(/@([A-Za-z0-9_][A-Za-z0-9_.]{2,29})/);
        if (m) { instagram = m[1]; break; }
      }
    }

    const notes = [];
    const hints = [];
    for (let i = 0; i < lines.length; i++) {
      const full = lineWithValue(lines, i);
      if (RX_REVEAL.test(lines[i]) && notes.length < 3) notes.push(snippet(full, RX_REVEAL));
      else if (RX_TRANSIT.test(lines[i]) && hints.length < 3) hints.push(snippet(full, RX_TRANSIT));
    }

    return {
      telegram: tg ? tg[1] : null,
      instagram,
      notes: [...new Set(notes)],
      hints: [...new Set(hints)]
    };
  }

  SG.readEvent = function readEvent() {
    try {
      const geo = fromJsonLd();
      if (!geo) return { found: false };
      const secret = isSecret(geo);
      return {
        found: true,
        title: eventTitle(),
        secret,
        cityCentroid: isKnownCentroid(geo.lat, geo.lon),
        // Le canal de révélation n'a d'intérêt que sur un lieu non divulgué.
        guidance: secret ? extractGuidance(eventDescription()) : null,
        ...geo
      };
    } catch (e) {
      return { found: false, error: String((e && e.message) || e).slice(0, 200) };
    }
  };
})();
