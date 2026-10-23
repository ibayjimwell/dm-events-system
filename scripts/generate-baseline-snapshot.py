"""Generate a Drizzle v7 baseline snapshot from the committed initial SQL migration.
A committed snapshot lets subsequent drizzle-kit generate diff the current schema
instead of attempting to recreate the initial tables. Run only when editing 0000_initial.
"""
import re,json,uuid,pathlib
text=pathlib.Path('drizzle/0000_initial.sql').read_text()
parts=text.split('--> statement-breakpoint')
def split_fields(body):
    out=[];buf='';depth=0;quote=False
    for c in body:
        if c=="'": quote=not quote
        if c=='(' and not quote:depth+=1
        if c==')' and not quote:depth-=1
        if c==',' and depth==0 and not quote:out.append(buf.strip());buf='';continue
        buf+=c
    if buf.strip():out.append(buf.strip())
    return out
snapshot={'id':str(uuid.uuid4()),'prevId':'00000000-0000-0000-0000-000000000000','version':'7','dialect':'postgresql','tables':{},'enums':{},'schemas':{},'sequences':{},'roles':{},'policies':{},'views':{},'_meta':{'columns':{},'schemas':{},'tables':{}}}
for match in re.finditer(r'CREATE TYPE "([a-z_]+)" AS ENUM \(([^)]+)\)',text):
    name=match.group(1);snapshot['enums']['public.'+name]={'name':name,'schema':'','values':[x.strip().strip("'") for x in match.group(2).split(',')]}
for part in parts:
    match=re.search(r'CREATE TABLE "([a-z_]+)" \((.*)\);',part,flags=re.S)
    if not match:continue
    name,body=match.groups();table={'name':name,'schema':'','columns':{},'indexes':{},'foreignKeys':{},'compositePrimaryKeys':{},'uniqueConstraints':{},'policies':{},'checkConstraints':{},'isRLSEnabled':False}
    for f in split_fields(body):
        if f.startswith('CONSTRAINT') and 'PRIMARY KEY' in f:
            matchpk=re.search(r'CONSTRAINT "([\w]+)" PRIMARY KEY \((.*)\)',f)
            if matchpk:table['compositePrimaryKeys'][matchpk.group(1)]={'name':matchpk.group(1),'columns':re.findall(r'"(.*?)"',matchpk.group(2))}
            continue
        m=re.match(r'"([a-z_]+)" (uuid|varchar\(\d+\)|text\[\]|text|integer|boolean|timestamptz|date|jsonb|numeric\(\d+,\d+\)|"[\w]+")(.*)',f,re.S)
        if not m:
            # fallback for regex word boundary after parentheses
            m=re.match(r'"([a-z_]+)" ([^ ]+(?:\(\d+,\d+\))?)(.*)',f,re.S)
        if not m:print('NOT PARSED',name,f[:80]);continue
        col,typ,rest=m.groups();ty={'timestamptz':'timestamp with time zone'}.get(typ,typ)
        if typ.startswith('"') and typ.endswith('"'):ty=typ.strip('"')
        if typ.startswith('numeric('):ty=typ.replace(',',', ')
        primary='PRIMARY KEY' in rest
        obj={'name':col,'type':ty,'primaryKey':primary,'notNull':'NOT NULL' in rest or primary}
        d=re.search(r'DEFAULT (gen_random_uuid\(\)|now\(\)|true|false|\d+|\'[^\']*\'|\'\{\}\')',rest)
        if d:obj['default']=d.group(1)
        table['columns'][col]=obj
        ref=re.search(r'CONSTRAINT "([\w]+)" REFERENCES "([\w]+)"\("([\w]+)"\)(?: ON DELETE (CASCADE|SET NULL))?',rest)
        if ref:
            cname,target,targetcol,delmode=ref.groups()
            table['foreignKeys'][cname]={'name':cname,'tableFrom':name,'tableTo':target,'columnsFrom':[col],'columnsTo':[targetcol],'onDelete':(delmode or 'no action').lower(),'onUpdate':'no action'}
        if ' UNIQUE' in rest:
            un=name+'_'+col+'_unique';table['uniqueConstraints'][un]={'name':un,'nullsNotDistinct':False,'columns':[col]}
    snapshot['tables']['public.'+name]=table
# Indexes are separate CREATE INDEX statements.
for m in re.finditer(r'CREATE (UNIQUE )?INDEX "([\w]+)" ON "([\w]+)" \(([^)]+)\)',text):
    unique,index,table,cols=m.groups();target=snapshot['tables']['public.'+table]
    target['indexes'][index]={'name':index,'columns':[{'expression':v.strip().strip('"'),'isExpression':False,'asc':True,'nulls':'last'} for v in cols.split(',')],'isUnique':bool(unique),'concurrently':False,'method':'btree','with':{}}
# FK declared via ALTER TABLE after the circular dependencies exist.
for m in re.finditer(r'ALTER TABLE "([\w]+)" ADD CONSTRAINT "([\w]+)" FOREIGN KEY \("([\w]+)"\) REFERENCES "([\w]+)"\("([\w]+)"\) ON DELETE (CASCADE|SET NULL)',text):
    table,name,col,to,tocol,ondelete=m.groups();snapshot['tables']['public.'+table]['foreignKeys'][name]={'name':name,'tableFrom':table,'tableTo':to,'columnsFrom':[col],'columnsTo':[tocol],'onDelete':ondelete.lower(),'onUpdate':'no action'}
pathlib.Path('drizzle/meta/0000_snapshot.json').write_text(json.dumps(snapshot,indent=2,ensure_ascii=False)+'\n')
print('Snapshot:',len(snapshot['tables']),'tables,',len(snapshot['enums']),'enums')
