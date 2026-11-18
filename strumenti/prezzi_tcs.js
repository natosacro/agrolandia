// Prezzi delle stazioni AGROLA accanto ai LANDI XL, letti dalla mappa pubblica del TCS (benzin.tcs.ch)
// come farebbe un visitatore: il browser si posiziona sulla stazione e legge i prezzi mostrati per
// Bleifrei 95, Bleifrei 98+ e Diesel. Scrive ../prezzi_tcs.json e stampa in JSON cosa è cambiato.
// La prima volta cerca su TCS l'identificativo di ogni stazione AGROLA e lo salva in ../tcs_stazioni.json.
// Uso: node prezzi_tcs.js   (serve Playwright con Chromium)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const BASE = path.join(__dirname, '..');
const fileStazioni = path.join(BASE, 'tcs_stazioni.json'), filePrezzi = path.join(BASE, 'prezzi_tcs.json');
const leggiJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };

// Negozi con AGROLA dal sito: [cantone, località, nome, indirizzo, NPA, agrola, indirizzo TopShop, nota, lat, lon]
const html = fs.readFileSync(path.join(BASE, 'index.html'), 'utf8');
const blocco = html.slice(html.indexOf('const NEGOZI = ['), html.indexOf('].map(r => ({ ct:r[0]'));
const ident = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/str\.?\b/g, 'strasse').replace(/[^a-z0-9]/g, '');
const negozi = [...blocco.matchAll(/\[("[A-Z]{2}".*?)\],?\n/g)].map(m => JSON.parse('[' + m[1] + ']'))
  .filter(r => r[5] === 'si' || r[5] === 'vicino').map(r => ({ id: ident(r[2]), indTop: r[6], lat: r[8], lon: r[9] }));

const CARBURANTI = [['bleifrei95', /^bleifrei 95$/i], ['super98', /^bleifrei 98\+$/i], ['diesel', /^diesel$/i]];
const POS = { x: 1249, y: 579 }, MENO = { x: 1249, y: 669 }; // tasti "posizione" e "zoom indietro" della mappa (1280x720)

async function apriMappa(browser, lat, lon) {
  const c = await browser.newContext({ geolocation: { latitude: lat, longitude: lon }, permissions: ['geolocation'], viewport: { width: 1280, height: 720 } });
  const p = await c.newPage();
  const st = { ultimi: [] };
  p.on('response', async r => { if (/benzinGetStationByBbox/.test(r.url())) { try { st.ultimi = JSON.parse(await r.text()); } catch (e) {} } });
  await p.goto('https://benzin.tcs.ch/de/map/SP95', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(7000);
  await p.mouse.click(POS.x, POS.y);
  await p.waitForTimeout(6000);
  return { c, p, st };
}

(async () => {
  const browser = await chromium.launch();
  const stazioni = leggiJson(fileStazioni, {});
  const vecchi = leggiJson(filePrezzi, {});
  const nuovi = {}, nonLetti = [];
  for (const n of negozi) {
    try {
      let s = stazioni[n.id];
      let { c, p, st } = await apriMappa(browser, s ? s.lat : n.lat, s ? s.lon : n.lon);
      if (!s) {
        // prima volta: si allarga la vista finché compare la AGROLA con lo stesso indirizzo del TopShop
        // stessa AGROLA: marchio AGROLA, stesso NPA del TopShop, la più vicina al punto di partenza
        const npa = (n.indTop.match(/\b\d{4}\b/) || [''])[0];
        const d2 = x => (x.latitude - n.lat) ** 2 + ((x.longitude - n.lon) * 0.68) ** 2;
        for (let k = 0; k < 3 && !s; k++) {
          const ag = st.ultimi.filter(x => !x.cluster && /agrola/i.test(x.brand || '') && (x.formattedAddress || '').includes(npa)).sort((a, b) => d2(a) - d2(b));
          if (ag.length) s = { tcs: ag[0].id, lat: ag[0].latitude, lon: ag[0].longitude, indirizzo: ag[0].formattedAddress, nome: ag[0].displayName };
          else { await p.mouse.click(MENO.x, MENO.y); await p.waitForTimeout(5000); }
        }
        if (!s) { nonLetti.push(n.id); await c.close(); continue; }
        stazioni[n.id] = s;
        await c.close();
        ({ c, p, st } = await apriMappa(browser, s.lat, s.lon));
      }
      const r = { tcs: s.tcs, indirizzo: s.indirizzo };
      for (const [campo, etichetta] of CARBURANTI) {
        if (campo !== 'bleifrei95') {
          st.ultimi = [];
          await p.getByText(etichetta).first().click().catch(() => {});
          await p.waitForTimeout(5000);
        }
        const x = st.ultimi.find(y => y.id === s.tcs);
        r[campo] = x && typeof x.price === 'number' ? x.price : null;
        r[campo + '_affid'] = x ? x.fiability || null : null;
      }
      await c.close();
      if (r.bleifrei95 == null && r.super98 == null && r.diesel == null) { nonLetti.push(n.id); if (vecchi[n.id]) nuovi[n.id] = vecchi[n.id]; continue; }
      const prima = vecchi[n.id];
      const uguali = prima && CARBURANTI.every(([k]) => prima[k] === r[k] && prima[k + '_affid'] === r[k + '_affid']);
      r.letto = uguali && prima.letto ? prima.letto : new Date().toISOString();
      r.verificato = new Date().toISOString();
      nuovi[n.id] = r;
    } catch (e) { nonLetti.push(n.id); if (vecchi[n.id]) nuovi[n.id] = vecchi[n.id]; }
  }
  await browser.close();
  fs.writeFileSync(fileStazioni, JSON.stringify(stazioni, null, 1));
  fs.writeFileSync(filePrezzi, JSON.stringify(nuovi));
  const cambiati = Object.keys(nuovi).filter(k => !vecchi[k] || CARBURANTI.some(([c]) => vecchi[k][c] !== nuovi[k][c] || vecchi[k][c + '_affid'] !== nuovi[k][c + '_affid']));
  console.log(JSON.stringify({ letti: Object.keys(nuovi).length - nonLetti.filter(k => nuovi[k]).length, non_letti: nonLetti, cambiati }));
})();
