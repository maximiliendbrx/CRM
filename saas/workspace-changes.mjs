// Planifie des modifications explicites ; aucun accès réseau ni stockage.
const mapping={companies:'companies',contacts:'contacts',interactions:'interactions',coldCalls:'cold_calls',followups:'reminders',projects:'projects'};
const normalize=x=>String(x||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('fr');
const canonical=x=>JSON.stringify(x,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const recordsEqual=(a,b)=>canonical(a)===canonical(b);
const sorted=x=>x.map(canonical).sort();
const extra=data=>Object.fromEntries(Object.entries(data).filter(([k])=>!(k in mapping)));
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Compare un état lu et ses lignes à une modification locale. L'état lu doit provenir de la même lecture. */
export function planWorkspaceChanges(baseline, records, desired, makeId=()=>globalThis.crypto.randomUUID()){
 if(!baseline||!desired||!records||[baseline,desired,records].some(x=>typeof x!=='object'||Array.isArray(x)))throw Error('État invalide');
 const settings=records.settings;
 if(!settings||!uuidPattern.test(settings.workspace_id)||!Number.isSafeInteger(settings.version)||settings.version<1||!settings.data||typeof settings.data!=='object'||Array.isArray(settings.data))throw Error('Paramètres de référence invalides');
 if(!recordsEqual(extra(baseline),settings.data.legacy_extra||{}))throw Error('Les paramètres de référence ont changé : rechargez le CRM');
 for(const [source,table] of Object.entries(mapping)){
  if(!Array.isArray(baseline[source])||!Array.isArray(desired[source])||!Array.isArray(records[table]))throw Error('Collection manquante : '+source);
  if(!recordsEqual(sorted(baseline[source]),sorted(records[table].map(row=>row.data))))throw Error('Les données de référence ont changé : rechargez le CRM');
  const ids=new Set();for(const row of records[table]){if(!uuidPattern.test(row.id)||row.workspace_id!==settings.workspace_id||!Number.isSafeInteger(row.version)||row.version<1||ids.has(row.id))throw Error('Identifiants ou versions invalides');ids.add(row.id)}
 }
 const used={}, wanted={}, oldByLegacy={}, oldByName=new Map(), desiredByName=new Map(), desiredContacts=new Map();
 for(const table of Object.values(mapping)){used[table]=new Set();wanted[table]=[];oldByLegacy[table]=new Map();for(const row of records[table]){const id=row.legacy_id||row.data?.id;if(id){if(oldByLegacy[table].has(id))throw Error('Identifiant historique ambigu');oldByLegacy[table].set(id,row)}if(table==='companies'){const name=normalize(row.name);if(!name||oldByName.has(name))throw Error('Entreprise ambiguë');oldByName.set(name,row)}}}
 function create(table,data,extraColumns={},match){
  const legacy=data.id||null;let old=match||legacy&&oldByLegacy[table].get(legacy)||null;
  if(old&&used[table].has(old.id))throw Error('Enregistrement associé plusieurs fois');
  const id=old?.id||makeId();if(!uuidPattern.test(id))throw Error('Identifiant créé invalide');
  if(!old&&(used[table].has(id)||records[table].some(row=>row.id===id)))throw Error('Identifiant créé déjà utilisé');
  used[table].add(id);
  const row={legacy_id:old?.legacy_id??legacy,data:structuredClone(data),...extraColumns};
  wanted[table].push({id,old,row});return id;
 }
 function addCompany(data){
  if(!data||typeof data!=='object'||Array.isArray(data)||!normalize(data.name))throw Error('Nom d’entreprise requis');
  const name=normalize(data.name);if(desiredByName.has(name))throw Error('Noms d’entreprise ambigus');
  const byId=data.id&&oldByLegacy.companies.get(data.id), byName=oldByName.get(name);
  if(byId&&byName&&byId.id!==byName.id)throw Error('Rapprochement d’entreprise ambigu');
  if(!byId&&byName&&data.id&&byName.legacy_id&&byName.legacy_id!==data.id)throw Error('Identifiant d’entreprise ambigu');
  const id=create('companies',data,{name:String(data.name).trim()},byId||byName);desiredByName.set(name,id);return id;
 }
 for(const company of desired.companies)addCompany(company);
 function companyFor(name){const key=normalize(name);if(!key)return null;if(desiredByName.has(key))return desiredByName.get(key);return addCompany({name:String(name).trim()})}
 for(const contact of desired.contacts){
  if(!contact?.id||!String(contact.name||'').trim()||desiredContacts.has(contact.id))throw Error('Contact invalide ou dupliqué');
  const company=companyFor(contact.company);const id=create('contacts',contact,{name:contact.name.trim(),company_id:company});desiredContacts.set(contact.id,id);
 }
 for(const [source,table] of Object.entries({interactions:'interactions',coldCalls:'cold_calls',followups:'reminders',projects:'projects'})){
  const ids=new Set();for(const item of desired[source]){
   if(!item?.id||ids.has(item.id))throw Error('Élément invalide ou dupliqué dans '+source);ids.add(item.id);
   const contact=item.contactId?desiredContacts.get(item.contactId):null;
   if((source==='interactions'||source==='followups')&&!contact)throw Error('Contact manquant dans '+source+' : modification non envoyée');
   const cols={contact_id:contact||null};
   if(source==='projects'){const company=companyFor(item.companyName||desired.contacts.find(c=>c.id===item.contactId)?.company);if(!company)throw Error('Entreprise manquante dans un projet');cols.company_id=company}
   create(table,item,cols);
  }
 }
 const inserts=[],updates=[],deletes=[];
 for(const table of Object.values(mapping)){
  for(const entry of wanted[table]){
   if(!entry.old){inserts.push({table,action:'insert',id:entry.id,row:entry.row});continue}
   const fields=Object.keys(entry.row).filter(k=>k!=='legacy_id');
   if(fields.some(k=>!recordsEqual(entry.old[k]??null,entry.row[k]??null)))updates.push({table,action:'update',id:entry.id,expected_version:entry.old.version,row:entry.row});
  }
 }
 for(const table of Object.values(mapping).reverse())for(const old of records[table])if(!used[table].has(old.id))deletes.push({table,action:'delete',id:old.id,expected_version:old.version});
 const settingsChanges=recordsEqual(extra(baseline),extra(desired))?[]:[{table:'workspace_settings',action:'update',id:settings.workspace_id,expected_version:settings.version,row:{data:{...structuredClone(settings.data),legacy_extra:structuredClone(extra(desired))}}}];
 const changes=[...inserts,...updates,...deletes,...settingsChanges];if(changes.length>500)throw Error('Trop de modifications pour une transaction');return changes;
}
