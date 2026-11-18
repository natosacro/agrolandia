// Legge gli orari dei TopShop AGROLA accanto ai LANDI XL dalle pagine pubbliche di agrola.ch
// (le pagine si caricano nel browser) e aggiorna ../agrola_orari.json. Stampa in JSON le stazioni cambiate.
// Uso: node orari_agrola.js   (serve Playwright con Chromium)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const dest = path.join(__dirname, '..', 'agrola_orari.json');
const vecchi = JSON.parse(fs.readFileSync(dest, 'utf8'));
const G = { 'Mo': 0, 'Di': 1, 'Mi': 2, 'Do': 3, 'Fr': 4, 'Sa': 5, 'So': 6 };
function leggi(testo, prima) {
  const i = testo.indexOf('Öffnungszeiten'); if (i < 0) return null;
  const seg = testo.slice(i, i + 900).replace(/\s+/g, ' ').split('Kunden-Feedback')[0];
  const settimana = prima.settimana.slice(), speciali = [];
  const re = /(Mo|Di|Mi|Do|Fr|Sa|So)\. (?:(\d\d)\.(\d\d)\.(\d{4}) )?(24h geöffnet|Geschlossen|(\d\d:\d\d) - (\d\d:\d\d))/g;
  let m, trovati = 0;
  while ((m = re.exec(seg))) {
    trovati++;
    const orari = m[5] === '24h geöffnet' ? [['00:00', '24:00']] : m[5] === 'Geschlossen' ? [] : [[m[6], m[7]]];
    if (m[2]) speciali.push({ data: `${m[4]}-${m[3]}-${m[2]}`, orari, nota: '' });
    else settimana[G[m[1]]] = orari;
  }
  if (!trovati) return null;
  const pompa24 = /24\/7|24h offen|24 ?Std|rund um die Uhr/.test(seg) || prima.pompa24;
  return { url: prima.url, settimana, speciali, pompa24 };
}
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  const nuovi = {}, nonLetti = [];
  for (const [id, v] of Object.entries(vecchi)) {
    let r = null;
    for (let k = 0; k < 3 && !r; k++) {
      await p.goto(v.url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
      await p.waitForSelector('text=Öffnungszeiten', { timeout: 30000 }).catch(() => {});
      await p.waitForTimeout(1500);
      r = leggi(await p.innerText('body').catch(() => ''), v);
    }
    if (r) nuovi[id] = r; else { nuovi[id] = v; nonLetti.push(id); }
  }
  await b.close();
  const cambiati = Object.keys(nuovi).filter(k => JSON.stringify(nuovi[k]) !== JSON.stringify(vecchi[k]));
  fs.writeFileSync(dest, JSON.stringify(nuovi));
  console.log(JSON.stringify({ letti: Object.keys(nuovi).length - nonLetti.length, non_letti: nonLetti, cambiati }));
})();
