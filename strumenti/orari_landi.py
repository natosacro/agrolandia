# Legge gli orari dei 48 LANDI XL da landi.ch e aggiorna ../orari.json.
# Stampa in JSON i negozi cambiati. Uso: python3 orari_landi.py
import re, json, subprocess, time, unicodedata, html
import os, sys
BASE=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
s=open(os.path.join(BASE,'index.html'),encoding='utf-8').read()
block=s[s.index('const NEGOZI = ['):s.index('].map(r => ({ ct:r[0]')]
neg=[json.loads('['+r+']') for r in re.findall(r'\[("[A-Z]{2}".*?)\],?\n',block)]
OV={"landi-buchs-ag":"landi-buchs-(ag)-wynecenter","landi-st-margrethen":"landi-st-margrethen-laveba-landi-ag","landi-le-cret-du-locle":"landi-le-cr%C3%AAt-du-locle"}
def slug(n):
    b=n.lower().replace('ä','ae').replace('ö','oe').replace('ü','ue')
    b=unicodedata.normalize('NFD',b).encode('ascii','ignore').decode()
    b=re.sub(r'[^a-z0-9]+','-',b).strip('-'); return OV.get(b,b)
def ident(n):
    b=unicodedata.normalize('NFD',n.lower()); b=''.join(c for c in b if unicodedata.category(c)!='Mn')
    return re.sub(r'[^a-z0-9]+','-',b).strip('-')
DE=['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag']
R=r'(\d{2}:\d{2}) - (\d{2}:\d{2})'
def parse(body):
    t=re.sub(r'<script.*?</script>','',body,flags=re.S); t=re.sub(r'<style.*?</style>','',t,flags=re.S)
    x=re.sub(r'\s+',' ',html.unescape(re.sub(r'<[^>]+>',' ',t)))
    i=x.find('Öffnungszeiten Montag')
    if i<0:
        m=re.search(r'Öffnungszeiten (?=(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag))',x)
        if not m: return None
        i=m.start()
    end=x.find('Kontakt',i); seg=x[i:end if end>0 else i+1500]
    sp=seg.find('Spezielle Öffnungszeiten'); week_txt=seg[:sp] if sp>0 else seg; spec_txt=seg[sp+len('Spezielle Öffnungszeiten'):] if sp>0 else ''
    week=[]
    for k,d in enumerate(DE):
        m=re.search(d+r' ((?:\d{2}:\d{2} - \d{2}:\d{2} ?)+)',week_txt)
        week.append([list(r) for r in re.findall(R,m.group(1))] if m else [])
    spec=[]
    for m in re.finditer(r'(\d{2})\.(\d{2})\.(\d{4}) (.*?)(?=\d{2}\.\d{2}\.\d{4}|$)',spec_txt):
        d=f'{m.group(3)}-{m.group(2)}-{m.group(1)}'; rest=m.group(4).strip()
        rs=[list(r) for r in re.findall(R,rest)]
        nome=re.sub(R,'',rest).replace('Geschlossen','').strip()
        spec.append({'data':d,'orari':rs,'nota':nome})
    return week,spec
out={}; bad=[]
for r in neg:
    name=r[2]; url=f'https://www.landi.ch/places/de/{slug(name)}'
    p=None
    for k in range(4):
        res=subprocess.run(['curl','-sS','-m','30','-A','Mozilla/5.0',url],capture_output=True,text=True)
        p=parse(res.stdout)
        if p and any(p[0]): break
        time.sleep(5*(k+1))
    if not p or not any(p[0]): bad.append(name); continue
    out[ident(name)]={'url':url,'settimana':p[0],'speciali':p[1]}
    time.sleep(1)
# Orari speciali senza doppioni
for v in out.values():
    visti=set(); v['speciali']=[x for x in v['speciali'] if not (json.dumps(x,sort_keys=True) in visti or visti.add(json.dumps(x,sort_keys=True)))]
dest=os.path.join(BASE,'orari.json')
old=json.load(open(dest,encoding='utf-8')) if os.path.exists(dest) else {}
# Negozi non letti: si tengono i dati precedenti
for k,v in old.items():
    if k not in out: out[k]=v
cambiati=[k for k in out if out[k]!=old.get(k)]
json.dump(out,open(dest,'w',encoding='utf-8'),ensure_ascii=False,separators=(',',':'))
print(json.dumps({'letti':len(out)-len(bad),'non_letti':bad,'cambiati':cambiati},ensure_ascii=False))
