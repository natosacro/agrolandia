# Copia i prezzi letti da prezzi_tcs.js (../prezzi_tcs.json) nel file letto dalla pagina (../prezzi.json, blocco "stazioni").
# Uso: python3 unisci_prezzi.py
import json, os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
tcs = json.load(open(os.path.join(BASE, 'prezzi_tcs.json'), encoding='utf-8'))
f = os.path.join(BASE, 'prezzi.json')
d = json.load(open(f, encoding='utf-8'))
st = d.setdefault('stazioni', {})
for k, r in tcs.items():
    st[k] = {'bleifrei95': r.get('bleifrei95'), 'super98': r.get('super98'), 'diesel': r.get('diesel'),
             'data': r.get('letto'), 'fonte': 'TCS',
             'affidabilita': r.get('bleifrei95_affid') or r.get('diesel_affid') or '',
             'verificato': r.get('verificato')}
json.dump(d, open(f, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(json.dumps({'stazioni': len(st)}))
