// Préparation locale sans écriture réseau : aucune donnée n'est imprimée.
import { inspectBackup } from './inspect-backup.mjs';

const key = value => String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('fr');
const clone = value => structuredClone(value);

/** Construit les enregistrements à importer sans modifier ni l'archive ni une base. */
export function buildImportPlan(backup, uuid = () => globalThis.crypto.randomUUID()) {
  const checked = inspectBackup(backup);
  if (checked.errors.length || checked.warnings.length) throw Error('Sauvegarde à corriger avant import : '+[...checked.errors,...checked.warnings].join(' '));
  const data = backup.data, companies = [], contacts = [], companyByName = new Map(), contactById = new Map();
  const addCompany = (payload, derived = false) => {
    const name = String(payload.name || '').trim();
    if (!name) throw Error('Une entreprise ne possède pas de nom.');
    const normalized = key(name);
    if (companyByName.has(normalized)) throw Error('Plusieurs entreprises ont le même nom normalisé : rapprochement manuel nécessaire.');
    const item = {id:uuid(),name,legacy_id:payload.id || null,data:clone(payload),derived};
    companies.push(item); companyByName.set(normalized,item); return item;
  };
  for (const company of data.companies || []) addCompany(company);
  const companyFor = name => {
    if (!key(name)) return null;
    return companyByName.get(key(name)) || addCompany({name:String(name).trim()},true);
  };
  for (const contact of data.contacts) {
    if (!String(contact.name || '').trim()) throw Error('Un contact ne possède pas de nom.');
    const company = companyFor(contact.company);
    const item = {id:uuid(),legacy_id:contact.id,name:contact.name.trim(),company_id:company?.id || null,data:clone(contact)};
    contacts.push(item); contactById.set(contact.id,item);
  }
  const linked = (kind, required = false) => (data[kind] || []).map(payload => {
    const contact = payload.contactId ? contactById.get(payload.contactId) : null;
    if (payload.contactId && !contact) throw Error(`Contact introuvable dans ${kind}.`);
    if (required && !contact) throw Error(`Contact manquant dans ${kind} : traitement manuel nécessaire.`);
    const row = {id:uuid(),legacy_id:payload.id,contact_id:contact?.id || null,data:clone(payload)};
    if (kind === 'projects') {
      const company = companyFor(payload.companyName || contact?.data.company);
      if (!company) throw Error('Entreprise manquante dans un projet : traitement manuel nécessaire.');
      row.company_id=company.id;
    }
    return row;
  });
  const interactions=linked('interactions',true), cold_calls=linked('coldCalls'), reminders=linked('followups',true), projects=linked('projects',true);
  // Conserver les extensions inconnues au même titre que les catalogues historiques.
  const extra = Object.fromEntries(Object.entries(data).filter(([name])=>!['companies','contacts','interactions','coldCalls','followups','projects'].includes(name)));
  return {companies,contacts,interactions,cold_calls,reminders,projects,settings:{legacy_extra:clone(extra)}};
}
