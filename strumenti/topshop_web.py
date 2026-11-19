# Dal file completo ../topshop.json prepara i due file compatti letti dalla pagina (tab "Benzina" dell'app):
#   ../topshop_dati.json   elenco, indirizzi, posizione e orari (cambiano di rado: si aggiorna una volta alla settimana)
#   ../topshop_prezzi.json solo i prezzi TCS (si aggiorna ogni giorno)
# Uso: python3 topshop_web.py
import json, os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
d = json.load(open(os.path.join(BASE, 'topshop.json'), encoding='utf-8'))

def giorno(f):
    if f is None: return '-'                       # orario sconosciuto
    return ','.join(a + '-' + b for a, b in f)     # '' = chiuso

modelli, righe, prezzi, verif = [], [], {}, ''
AFF = {'CONFIDENT': 'C', 'FEW_RECENT_PRICES': 'F', 'OLD_LAST_UPDATE': 'O', 'OUTDATED_LAST_PRICE_UPDATE': 'X'}
for k, v in sorted(d.items(), key=lambda kv: (kv[1].get('ct', ''), kv[1].get('loc', ''))):
    sett = '|'.join(giorno(f) for f in (v.get('settimana') or [None] * 7))
    if sett not in modelli: modelli.append(sett)
    spec = [[s['data'], giorno(s['orari'])] for s in v.get('speciali', [])]
    righe.append([k, 1 if 'carwash' in v.get('nome', '').lower() else 0, v['via'], v['npa'], v['loc'], v.get('ct', ''), v.get('tel', ''),
                  round(v['lat'], 5) if isinstance(v.get('lat'), (int, float)) else None,
                  round(v['lon'], 5) if isinstance(v.get('lon'), (int, float)) else None,
                  modelli.index(sett), spec, 1 if v.get('pompa24') else 0])
    p = v.get('prezzi')
    if p and (p.get('bleifrei95') or p.get('super98') or p.get('diesel')):
        r2 = lambda x: round(x, 2) if isinstance(x, (int, float)) else None   # i prezzi TCS a volte arrivano come 2.050000000000004
        prezzi[k] = [r2(p.get('bleifrei95')), r2(p.get('super98')), r2(p.get('diesel')), AFF.get(p.get('affidabilita'), '')]
        verif = max(verif, p.get('verificato', ''))

sep = (',', ':')
json.dump({'m': modelli, 't': righe}, open(os.path.join(BASE, 'topshop_dati.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=sep)
json.dump({'v': verif, 'p': prezzi}, open(os.path.join(BASE, 'topshop_prezzi.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=sep)
print(json.dumps({'topshop': len(righe), 'modelli_orari': len(modelli), 'con_prezzi': len(prezzi),
                  'kb_dati': round(os.path.getsize(os.path.join(BASE, 'topshop_dati.json')) / 1024, 1),
                  'kb_prezzi': round(os.path.getsize(os.path.join(BASE, 'topshop_prezzi.json')) / 1024, 1)}))
