// A new storage namespace intentionally clears the former demonstration data once.
// New entries are then retained normally when the page is refreshed.
const KEY = 'pulse-crm-v2';
const seed = { contacts: [], interactions: [], followups: [] };
let db = JSON.parse(localStorage.getItem(KEY) || 'null') || structuredClone(seed);
let selectedContactId = null;
const byId = id => db.contacts.find(c => c.id === id);
const save = () => localStorage.setItem(KEY, JSON.stringify(db));
const date = value => new Intl.DateTimeFormat('fr-FR', { dateStyle:'medium' }).format(new Date(value + (value.length === 10 ? 'T12:00:00' : '')));
function empty() { return document.getElementById('empty').content.cloneNode(true); }
function render() {
  document.getElementById('contact-count').textContent = db.contacts.length;
  document.getElementById('company-count').textContent = new Set(db.contacts.map(c => c.company.trim().toLowerCase())).size;
  document.getElementById('followup-count').textContent = db.followups.filter(f => !f.done).length;
  const query = document.getElementById('search').value.toLowerCase();
  const contacts = db.contacts.filter(c => Object.values(c).some(v => v.toLowerCase().includes(query)));
  const contactList = document.getElementById('contacts'); contactList.replaceChildren();
  contacts.length ? contacts.forEach(c => contactList.insertAdjacentHTML('beforeend', `<article class="record"><div><strong>${escape(c.name)}</strong><span class="meta">${escape(c.role || 'Contact')} · ${escape(c.phone || 'Sans téléphone')} · ${escape(c.email || 'Sans e-mail')}</span></div><div class="record-actions"><span class="pill">${escape(c.company)}</span><button class="open" data-open="${c.id}">Ouvrir</button></div></article>`)) : contactList.append(empty());
  ['interaction-contact','followup-contact'].forEach(id => { const el=document.getElementById(id); el.replaceChildren(...db.contacts.map(c => new Option(`${c.name} — ${c.company}`,c.id))); });
  const interactions=document.getElementById('interactions'); interactions.replaceChildren();
  const sorted=[...db.interactions].sort((a,b)=>b.date.localeCompare(a.date));
  sorted.length ? sorted.forEach(i=>{const c=byId(i.contactId); interactions.insertAdjacentHTML('beforeend',`<article class="event"><strong>${escape(i.type)} · ${escape(c?.name || 'Contact supprimé')}</strong><p>${escape(i.note)}</p><time>${date(i.date)}</time></article>`);}) : interactions.append(empty());
  const followups=document.getElementById('followups'); followups.replaceChildren();
  const today=new Date().toISOString().slice(0,10); const ordered=[...db.followups].sort((a,b)=>a.done-b.done || a.date.localeCompare(b.date));
  ordered.length ? ordered.forEach(f=>{ const c=byId(f.contactId); const overdue=!f.done && f.date<today; followups.insertAdjacentHTML('beforeend',`<article class="followup ${overdue?'overdue':''} ${f.done?'done':''}"><div><strong>${escape(f.title)}</strong><span class="meta">${escape(c?.name || 'Contact supprimé')} · ${date(f.date)}${overdue?' · En retard':''}</span></div>${f.done?'':`<button data-done="${f.id}">Terminer</button>`}</article>`); }) : followups.append(empty());
  document.querySelectorAll('[data-done]').forEach(b=>b.onclick=()=>{db.followups.find(f=>f.id===b.dataset.done).done=true;save();render();});
  document.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{selectedContactId=b.dataset.open;render();document.getElementById('contact-detail').scrollIntoView({behavior:'smooth',block:'nearest'});});
  renderContactDetail();
}
function renderContactDetail() {
  const target=document.getElementById('contact-detail'); target.replaceChildren();
  const contact=byId(selectedContactId); if (!contact) return;
  const history=[...db.interactions].filter(i=>i.contactId===contact.id).sort((a,b)=>b.date.localeCompare(a.date));
  const followups=[...db.followups].filter(f=>f.contactId===contact.id).sort((a,b)=>a.date.localeCompare(b.date));
  target.insertAdjacentHTML('beforeend', `<article class="detail-card"><div class="detail-head"><div><p class="eyebrow">FICHE CONTACT</p><h3>${escape(contact.name)}</h3><span class="meta">${escape(contact.role || 'Contact')} · ${escape(contact.company)}</span></div><span class="pill">${escape(contact.phone || 'Sans téléphone')} · ${escape(contact.email || 'Sans e-mail')}</span></div><div class="detail-grid"><section><h4>Historique des interactions</h4><div class="detail-list">${history.length ? history.map(i=>`<article class="event"><strong>${escape(i.type)}</strong><p>${escape(i.note)}</p><time>${date(i.date)}</time></article>`).join('') : '<p class="empty">Aucune interaction enregistrée.</p>'}</div></section><section><h4>Relances</h4><div class="detail-list">${followups.length ? followups.map(f=>`<div><strong>${escape(f.title)}</strong><span class="meta"> · ${date(f.date)}${f.done?' · Terminée':''}</span></div>`).join('') : '<p class="empty">Aucune relance planifiée.</p>'}</div></section></div><div class="detail-actions"><button class="close" id="close-detail">Fermer</button><button class="delete" id="delete-contact">Supprimer ce contact</button></div></article>`);
  document.getElementById('close-detail').onclick=()=>{selectedContactId=null;render();};
  document.getElementById('delete-contact').onclick=()=>{if(confirm(`Supprimer ${contact.name} et tout son historique ?`)){db.contacts=db.contacts.filter(c=>c.id!==contact.id);db.interactions=db.interactions.filter(i=>i.contactId!==contact.id);db.followups=db.followups.filter(f=>f.contactId!==contact.id);selectedContactId=null;save();render();}};
}
function escape(s) { const el=document.createElement('div'); el.textContent=s; return el.innerHTML; }
document.getElementById('search').oninput=render;
document.getElementById('contact-form').onsubmit=e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target)); db.contacts.push({id:crypto.randomUUID(),...d});save();e.target.reset();render();};
document.getElementById('interaction-form').onsubmit=e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));db.interactions.push({id:crypto.randomUUID(),...d,date:new Date().toISOString()});save();e.target.reset();render();};
document.getElementById('followup-form').onsubmit=e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));db.followups.push({id:crypto.randomUUID(),...d,done:false});save();e.target.reset();render();};
render();
