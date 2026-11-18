# Media svizzera dei prezzi del carburante dalla pagina pubblica del TCS ("Benzinpreise in der Schweiz und in Europa")
# e aggiornamento di ../prezzi.json (blocco "riferimento"). Uso: python3 media_tcs.py
import json, os, re, html, subprocess, datetime

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = 'https://www.tcs.ch/de/camping-reisen/reiseinformationen/wissenswertes/fahrkosten-gebuehren/benzinpreise.php'

pagina = ''
for _ in range(3):
    r = subprocess.run(['curl', '-sS', '-L', '-m', '40', '-A', 'Mozilla/5.0', URL], capture_output=True, text=True)
    pagina = r.stdout
    if 'Schweiz' in pagina: break
testo = re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', re.sub(r'<(script|style).*?</\1>', '', pagina, flags=re.S))))
# es. "Schweiz 1.89 2 2.29 Unverändert gültig seit: 18.11.2026"
m = re.search(r'Schweiz (\d+(?:\.\d+)?) (\d+(?:\.\d+)?) (\d+(?:\.\d+)?) (?:\d+(?:\.\d+)? )?Unver\w+ g\w+ltig seit: (\d\d)\.(\d\d)\.(\d{4})', testo)
f = os.path.join(BASE, 'prezzi.json')
d = json.load(open(f, encoding='utf-8'))
rif = d.setdefault('riferimento', {'etichetta': 'Media svizzera', 'fonte': 'TCS'})
ora = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z')
if not m:
    print(json.dumps({'letto': False}))
else:
    p95, p98, dsl = (round(float(x), 2) for x in m.group(1, 2, 3))
    data = f'{m.group(6)}-{m.group(5)}-{m.group(4)}'
    cambiato = (rif.get('bleifrei95'), rif.get('super98'), rif.get('diesel'), rif.get('data')) != (p95, p98, dsl, data)
    rif.update({'fonte': 'TCS', 'data': data, 'bleifrei95': p95, 'super98': p98, 'diesel': dsl, 'verificato': ora})
    d['aggiornato'] = data
    json.dump(d, open(f, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(json.dumps({'letto': True, 'data': data, 'bleifrei95': p95, 'super98': p98, 'diesel': dsl, 'cambiato': cambiato}))
