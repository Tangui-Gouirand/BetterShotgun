// Génère les icônes de l'extension aux couleurs de shotgun.live :
// carré arrondi accent #ff765f, repère de carte en #1c1c1c, comme le bouton
// « Maps » de la carte lieu. Rasterisation analytique + suréchantillonnage,
// encodage PNG à la main (zlib est dans Node, pas d'encodeur PNG).
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const BG = [255, 118, 95];   // --accent
const FG = [28, 28, 28];     // --dark

/* ------------------------------------------------------------- géométrie */

// Coordonnées normalisées (0..1).
const RADIUS = 0.22;              // arrondi du carré
const HEAD = { x: 0.5, y: 0.42, r: 0.255 };
const HOLE_R = 0.105;
const TIP = { x: 0.5, y: 0.88 };

// Le corps du repère est le triangle qui joint la pointe aux deux points de
// tangence du cercle : c'est ce qui donne la goutte, sans raccord visible.
const d = TIP.y - HEAD.y;
const cosA = HEAD.r / d;
const sinA = Math.sqrt(1 - cosA * cosA);
const T1 = { x: HEAD.x - HEAD.r * sinA, y: HEAD.y + HEAD.r * cosA };
const T2 = { x: HEAD.x + HEAD.r * sinA, y: HEAD.y + HEAD.r * cosA };

function inCircle(x, y, c, r) {
  const dx = x - c.x;
  const dy = y - c.y;
  return dx * dx + dy * dy <= r * r;
}

function inTriangle(x, y, a, b, c) {
  const s = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
  const l1 = ((b.y - c.y) * (x - c.x) + (c.x - b.x) * (y - c.y)) / s;
  const l2 = ((c.y - a.y) * (x - c.x) + (a.x - c.x) * (y - c.y)) / s;
  return l1 >= 0 && l2 >= 0 && l1 + l2 <= 1;
}

function inRounded(x, y, r) {
  const cx = Math.min(Math.max(x, r), 1 - r);
  const cy = Math.min(Math.max(y, r), 1 - r);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

// Renvoie [couverture du fond, couverture du repère] pour un point.
function sample(x, y) {
  if (!inRounded(x, y, RADIUS)) return [0, 0];
  const pin = (inCircle(x, y, HEAD, HEAD.r) || inTriangle(x, y, TIP, T1, T2)) &&
    !inCircle(x, y, HEAD, HOLE_R);
  return [1, pin ? 1 : 0];
}

const SS = 4; // suréchantillonnage par axe

function render(size) {
  const px = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let pxi = 0; pxi < size; pxi++) {
      let bg = 0;
      let fg = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const [b, f] = sample((pxi + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size);
          bg += b;
          fg += f;
        }
      }
      const n = SS * SS;
      const alpha = bg / n;
      const mix = alpha > 0 ? (fg / n) / alpha : 0; // part du repère dans l'opaque
      const o = (py * size + pxi) * 4;
      for (let c = 0; c < 3; c++) {
        px[o + c] = Math.round(BG[c] * (1 - mix) + FG[c] * mix);
      }
      px[o + 3] = Math.round(alpha * 255);
    }
  }
  return px;
}

/* ------------------------------------------------------------ encodage */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // 8 bits par canal
  ihdr[9] = 6;   // RGBA
  // Chaque ligne est précédée de son octet de filtre, ici 0 (aucun).
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const dir = process.argv[2];
for (const size of [16, 32, 48, 128]) {
  const file = path.join(dir, 'icon' + size + '.png');
  fs.writeFileSync(file, png(size, render(size)));
  console.log(file, fs.statSync(file).size + ' o');
}
