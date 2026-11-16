// Validation partagée par le navigateur et les outils locaux.
const COLLECTIONS=['contacts','companies','interactions','coldCalls','followups','projects'];
export function inspectBackup(backup){
 if(!backup||backup.version!==1||!backup.data||typeof backup.data!=='object'||Array.isArray(backup.data))throw Error('Format de sauvegarde inconnu : version 1 et objet data attendus.');
 const data=backup.data,errors=[],warnings=[],counts={};
 for(const key of COLLECTIONS){const value=data[key];if(value===undefined){if(['contacts','interactions','followups'].includes(key))errors.push(`Collection obligatoire absente : ${key}`);else counts[key]=0;continue}if(!Array.isArray(value)){errors.push(`Collection non valide : ${key}`);continue}counts[key]=value.length;const ids=new Set();for(const item of value){if(!item||typeof item!=='object'||Array.isArray(item)){errors.push(`Élément non valide dans ${key}`);continue}if(typeof item.id!=='string'||!item.id.trim()){if(key==='companies')warnings.push('Une entreprise sans identifiant devra être rapprochée par son nom.');else errors.push(`Identifiant absent dans ${key}`)}else if(ids.has(item.id))errors.push(`Identifiant dupliqué dans ${key}`);else ids.add(item.id)}}
 if(errors.length)return {counts,errors:[...new Set(errors)],warnings:[...new Set(warnings)]};
 const contacts=new Set(data.contacts.map(c=>c.id));for(const key of ['interactions','followups'])for(const item of data[key]||[])if(item.contactId&&!contacts.has(item.contactId))warnings.push(`Référence à un contact absent dans ${key} : traitement manuel nécessaire.`);
 if(data.catalogs!==undefined&&(!data.catalogs||typeof data.catalogs!=='object'||Array.isArray(data.catalogs)))errors.push('Catalogue de fonctions et secteurs non valide.');
 return {counts,errors:[...new Set(errors)],warnings:[...new Set(warnings)]};
}
