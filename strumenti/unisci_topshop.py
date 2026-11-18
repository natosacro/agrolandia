# Unisce l'elenco ufficiale dei TopShop (Excel dell'utente: Agrola_TopShop_per_cantone.xlsx, foglio "TopShop")
# con gli orari letti da agrola.ch (../topshop.json scritto da "node topshop.js elenco").
# Tiene solo i tipi "TopShop" e "TopShop & CarWash". Riscrive ../topshop.json; le chiavi restano quelle di agrola.ch
# quando il TopShop è stato trovato là, altrimenti "x-<NPA>-<via>". Uso: python3 unisci_topshop.py <file.xlsx>
import json, os, re, sys, unicodedata
import openpyxl

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILE = os.path.join(BASE, 'topshop.json')

def norm(s):
    s = unicodedata.normalize('NFD', (s or '').lower()).encode('ascii', 'ignore').decode()
    s = re.sub(r'str\.?(?=\s|$)', 'strasse', s)
    return re.sub(r'[^a-z0-9]', '', s)

def via_base(s):
    return re.sub(r'\d.*$', '', norm(s))[:10]

righe = list(openpyxl.load_workbook(sys.argv[1], data_only=True)['TopShop'].iter_rows(values_only=True))[1:]
righe = [r for r in righe if r and r[2] in ('TopShop', 'TopShop & CarWash')]
letti = json.load(open(FILE, encoding='utf-8')) if os.path.exists(FILE) else {}

out, usati, senza = {}, set(), []
for ct, cantone, tipo, via, npa, loc, tel in righe:
    npa = str(npa).strip()
    cand = [(k, v) for k, v in letti.items() if k not in usati and v.get('npa') == npa]
    scelto = next(((k, v) for k, v in cand if via_base(v.get('via')) == via_base(via)), None) or (cand[0] if len(cand) == 1 else None)
    if scelto:
        k, v = scelto
        usati.add(k)
    else:
        k, v = 'x-%s-%s' % (npa, via_base(via)), {}
        senza.append('%s, %s %s' % (via, npa, loc))
    v = dict(v)
    v.update({'nome': 'AGROLA ' + tipo, 'via': via, 'npa': npa, 'loc': loc, 'ct': ct, 'tel': tel or ''})
    out[k] = v

json.dump(out, open(FILE, 'w', encoding='utf-8'), ensure_ascii=False)
print(json.dumps({'excel': len(righe), 'con_orari': sum(1 for v in out.values() if v.get('settimana')), 'senza_orari': senza}, ensure_ascii=False))
