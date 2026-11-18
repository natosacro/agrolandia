// Tutti gli AGROLA TopShop della Svizzera per il tab "Benzina" dell'app.
//   node topshop.js elenco   -> elenco da agrola.ch (Standortfinder) + orari della settimana dalla pagina di ogni TopShop
//   node topshop.js prezzi   -> posizione e prezzi (Bleifrei 95, 98+, Diesel) dalla mappa pubblica benzin.tcs.ch
// Scrive ../topshop.json e stampa in JSON un riepilogo. Serve Playwright con Chromium.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const BASE = path.join(__dirname, '..');
const FILE = path.join(BASE, 'topshop.json');
const leggiJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const pausa = ms => new Promise(r => setTimeout(r, ms));
// esegue fn su tutti gli elementi con al massimo n lavori in parallelo
async function aGruppi(lista, n, fn) { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < lista.length) await fn(lista[i++]); })); }

// ---------- orari dalla pagina della stazione su agrola.ch ----------
const G = { Mo: 0, Di: 1, Mi: 2, Do: 3, Fr: 4, Sa: 5, So: 6 };
function leggiPagina(testo, prima) {
  const i = testo.indexOf('Öffnungszeiten'); if (i < 0) return null;
  const testa = testo.slice(Math.max(0, testo.indexOf('Zurück zur Karte')), i).split('\n').map(s => s.trim()).filter(Boolean);
  const indirizzo = testa.find(s => /,\s*\d{4}\s/.test(s)) || (prima && prima.indirizzo) || '';
  const seg = testo.slice(i, i + 900).replace(/\s+/g, ' ').split('Kunden-Feedback')[0];
  const settimana = (prima && prima.settimana ? prima.settimana.slice() : [null, null, null, null, null, null, null]), speciali = [];
  const re = /(Mo|Di|Mi|Do|Fr|Sa|So)\. (?:(\d\d)\.(\d\d)\.(\d{4}) )?(24h geöffnet|Geschlossen|(\d\d:\d\d) - (\d\d:\d\d))/g;
  let m, trovati = 0;
  while ((m = re.exec(seg))) {
    trovati++;
    const orari = m[5] === '24h geöffnet' ? [['00:00', '24:00']] : m[5] === 'Geschlossen' ? [] : [[m[6], m[7]]];
    if (m[2]) speciali.push({ data: `${m[4]}-${m[3]}-${m[2]}`, orari, nota: '' }); else settimana[G[m[1]]] = orari;
  }
  if (!trovati) return null;
  return { indirizzo, settimana, speciali, pompa24: /24\/7|24h offen|24 ?Std|rund um die Uhr/.test(seg) };
}

async function elenco() {
  const vecchi = leggiJson(FILE, {});
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  await p.goto('https://agrola.ch/de/standort/s', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(9000);
  const tutti = new Map(); let fermo = 0;
  for (let i = 0; i < 300 && fermo < 8; i++) {
    const got = await p.$$eval('a', as => as.filter(a => /\/standort\/l\//.test(a.href)).map(a => [a.href, (a.closest('li') || a.parentElement).innerText.replace(/\s+/g, ' ').slice(0, 160)]));
    const prima = tutti.size; got.forEach(([h, t]) => tutti.set(h, t)); fermo = tutti.size === prima ? fermo + 1 : 0;
    await p.evaluate(() => { document.querySelectorAll('*').forEach(el => { if (el.scrollHeight > el.clientHeight + 50 && /auto|scroll/.test(getComputedStyle(el).overflowY)) el.scrollTop = el.scrollHeight; }); window.scrollBy(0, 3000); });
    await p.waitForTimeout(1200);
  }
  await p.close();
  const topshop = [...tutti].filter(([h, t]) => /^AGROLA TopShop/i.test(t));
  const nuovi = {}, nonLetti = [];
  await aGruppi(topshop, 3, async ([href, testo]) => {
    const id = href.split('/').pop();
    const prima = vecchi[id];
    const pg = await b.newPage();
    let r = null;
    for (let k = 0; k < 3 && !r; k++) {
      await pg.goto(href, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
      await pg.waitForSelector('text=Öffnungszeiten', { timeout: 30000 }).catch(() => {});
      await pg.waitForTimeout(1500);
      r = leggiPagina(await pg.innerText('body').catch(() => ''), prima);
    }
    await pg.close();
    const nome = testo.replace(/\s+(Jetzt|Geschlossen|Öffnet|Route).*$/, '').replace(/\s+\S.*?\d{4}\s.*$/, '').trim();
    if (!r) { nonLetti.push(id); if (prima) nuovi[id] = prima; return; }
    const [via, resto] = r.indirizzo.split(/,\s*/);
    const npa = ((resto || '').match(/\d{4}/) || [''])[0], loc = (resto || '').replace(/^\s*\d{4}\s*/, '').trim();
    nuovi[id] = Object.assign({}, prima || {}, { nome: /topshop/i.test(nome) ? nome : 'AGROLA TopShop', via: via || '', npa, loc, url: href, settimana: r.settimana, speciali: r.speciali, pompa24: r.pompa24 });
  });
  await b.close();
  fs.writeFileSync(FILE, JSON.stringify(nuovi));
  console.log(JSON.stringify({ topshop: topshop.length, letti: Object.keys(nuovi).length - nonLetti.length, non_letti: nonLetti }));
}

// ---------- posizione e prezzi dalla mappa TCS ----------
const POS = { x: 1249, y: 579 }, MENO = { x: 1249, y: 669 };
const CARBURANTI = [['bleifrei95', /^bleifrei 95$/i], ['super98', /^bleifrei 98\+$/i], ['diesel', /^diesel$/i]];
const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/str\.?(?=\s|$)/g, 'strasse').replace(/[^a-z0-9]/g, '');
// centro delle località per NPA (file localita-*.txt del sito)
function centriNpa() {
  const out = {};
  for (const f of ['localita-1.txt', 'localita-2.txt', 'localita-3.txt']) {
    for (const r of fs.readFileSync(path.join(BASE, f), 'utf8').split('\n')) {
      if (!r || r[0] === '#') continue;
      const [nome, npa, la, lo] = r.split(';');
      if (npa && !out[npa]) out[npa] = { lat: 45.8 + Number(la) / 1000, lon: 5.9 + Number(lo) / 1000 };
    }
  }
  return out;
}
async function apriMappa(browser, lat, lon) {
  const c = await browser.newContext({ geolocation: { latitude: lat, longitude: lon }, permissions: ['geolocation'], viewport: { width: 1280, height: 720 } });
  const p = await c.newPage(); const st = { ultimi: [] };
  p.on('response', async r => { if (/benzinGetStationByBbox/.test(r.url())) { try { st.ultimi = JSON.parse(await r.text()); } catch (e) {} } });
  await p.goto('https://benzin.tcs.ch/de/map/SP95', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(7000); await p.mouse.click(POS.x, POS.y); await p.waitForTimeout(6000);
  return { c, p, st };
}
async function prezzi() {
  const dati = leggiJson(FILE, {}), centri = centriNpa();
  // se una AGROLA accanto ai LANDI XL ha lo stesso NPA, si riusa la stazione TCS già trovata (../tcs_stazioni.json)
  const note = leggiJson(path.join(BASE, 'tcs_stazioni.json'), {});
  for (const s of Object.values(dati)) if (!s.tcs) { const x = Object.values(note).find(n => (n.indirizzo || '').includes(s.npa)); if (x) Object.assign(s, { tcs: x.tcs, lat: x.lat, lon: x.lon, indirizzo_tcs: x.indirizzo }); }
  const b = await chromium.launch();
  const nonLetti = [], cambiati = [];
  await aGruppi(Object.entries(dati), 3, async ([id, s]) => {
    try {
      let { c, p, st } = await apriMappa(b, s.lat || (centri[s.npa] || {}).lat || 46.8, s.lon || (centri[s.npa] || {}).lon || 8.2);
      if (!s.tcs) {
        // prima volta: la AGROLA con lo stesso NPA, preferendo la stessa via
        const via = norm(s.via).replace(/\d.*$/, '').slice(0, 8);
        for (let k = 0; k < 3 && !s.tcs; k++) {
          const ag = st.ultimi.filter(x => !x.cluster && /agrola/i.test(x.brand || '') && (x.formattedAddress || '').includes(s.npa));
          const x = ag.find(y => via && norm(y.formattedAddress).includes(via)) || (ag.length === 1 ? ag[0] : null);
          if (x) Object.assign(s, { tcs: x.id, lat: x.latitude, lon: x.longitude, indirizzo_tcs: x.formattedAddress });
          else { await p.mouse.click(MENO.x, MENO.y); await p.waitForTimeout(5000); }
        }
        await c.close();
        if (!s.tcs) { nonLetti.push(id); return; }
        ({ c, p, st } = await apriMappa(b, s.lat, s.lon));
      }
      const r = {};
      for (const [campo, etichetta] of CARBURANTI) {
        if (campo !== 'bleifrei95') { st.ultimi = []; await p.getByText(etichetta).first().click().catch(() => {}); await p.waitForTimeout(5000); }
        const x = st.ultimi.find(y => y.id === s.tcs);
        r[campo] = x && typeof x.price === 'number' ? x.price : null;
        r[campo + '_affid'] = x ? x.fiability || null : null;
      }
      await c.close();
      if (r.bleifrei95 == null && r.super98 == null && r.diesel == null) { nonLetti.push(id); return; }
      const prima = JSON.stringify(s.prezzi || {});
      s.prezzi = { bleifrei95: r.bleifrei95, super98: r.super98, diesel: r.diesel, affidabilita: r.bleifrei95_affid || r.diesel_affid || '', verificato: new Date().toISOString() };
      if (JSON.stringify(Object.assign({}, s.prezzi, { verificato: 0 })) !== JSON.stringify(Object.assign({}, JSON.parse(prima), { verificato: 0 }))) cambiati.push(id);
    } catch (e) { nonLetti.push(id); }
  });
  await b.close();
  fs.writeFileSync(FILE, JSON.stringify(dati));
  console.log(JSON.stringify({ topshop: Object.keys(dati).length, con_prezzi: Object.values(dati).filter(s => s.prezzi).length, non_letti: nonLetti.length, cambiati: cambiati.length }));
}

(process.argv[2] === 'prezzi' ? prezzi : elenco)().catch(e => { console.error(e); process.exit(1); });
