// Rapport test : export Excel personnalisable (jeu de données, filtres multiples, répartition en onglets, colonnes, tri).
// Le rapport de base (reports.js) n'est pas modifié ; ce fichier réutilise son générateur de classeur.
(function(){
 const form=$('report-test-form');if(!form)return;
 const clean=s=>String(s??'').trim().replace(/\s+/g,' ');
 const norm=s=>companyKey(clean(s));
 const excel=v=>{const day=reportDay(v),ms=Date.parse(day+'T00:00:00Z');return day&&Number.isFinite(ms)?{excelDate:Math.round(ms/86400000)+25569}:''};
 const yesNo=v=>v===true?'Oui':v===false?'Non':'';
 const fr=(a,b)=>String(a).localeCompare(String(b),'fr');

 // ---------- Jeux de données ----------
 // Chaque ligne : ctx = valeurs servant aux filtres et à la répartition ; cells = valeurs exportées.
 function lookups(){
  const directory=companyDirectory(),bySector=new Map();
  for(const [key,company] of directory){const s=clean(company.sector);if(s)bySector.set(key,s)}
  for(const call of (Array.isArray(db.coldCalls)?db.coldCalls:[])){const key=companyKey(call.company),s=clean(call.sector);if(key&&s&&!bySector.has(key))bySector.set(key,s)}
  return {directory,sectorOf:name=>bySector.get(companyKey(name))||''};
 }
 const contactCtx=(L,contact,company,date)=>({sector:L.sectorOf(company||contact?.company),company:clean(company||contact?.company),status:contact?(contact.status||'À qualifier'):'',role:clean(contact?.role),date:date||''});
 const DATASETS={
  contacts:{label:'Contacts et leurs échanges',sort:'company',applies:['sector','company','status','role','period'],
   columns:[['name','Nom et prénom'],['company','Entreprise'],['sector','Secteur'],['role','Fonction'],['phone','Téléphone'],['email','E-mail'],['status','Statut commercial'],['date','Date de prise de contact'],['type','Type'],['participants','Autres participants'],['note','Compte rendu'],['nextDate','Date de la prochaine relance'],['nextTitle','Objet de la prochaine relance'],['tracking','Suivi des relances']],
   rows(L,o){const out=[],today=localDay(new Date());
    for(const c of db.contacts){
     const exchanges=db.interactions.filter(i=>involves(i,c.id)&&(o.notes||String(i.type||'').trim().toLocaleLowerCase('fr')!=='note')).sort((a,b)=>(Date.parse(b.date)||0)-(Date.parse(a.date)||0));
     const followups=db.followups.filter(f=>f.contactId===c.id),next=followups.filter(f=>!f.done).sort((a,b)=>String(a.date).localeCompare(String(b.date)))[0],done=followups.filter(f=>f.done).length;
     const tracking=followups.length?`${done} faite(s) sur ${followups.length}${next?(reportDay(next.date)<today?' · prochaine EN RETARD':' · prochaine à faire'):' · à jour'}`:'Aucune relance';
     const sector=L.sectorOf(c.company),base={name:c.name||'',company:c.company||'',sector,role:c.role||'',phone:c.phone||'',email:c.email||'',status:c.status||'À qualifier',nextDate:next?excel(next.date):'',nextTitle:next?.title||'',tracking};
     for(const x of exchanges.length?exchanges:[null])out.push({ctx:contactCtx(L,c,null,x?.date),cells:{...base,date:x?excel(x.date):'',type:x?.type||'',participants:x?otherParticipantNames(x,c.id):'',note:x?interactionNoteText(x):''}});
    }return out}},
  coldcalls:{label:'Cold calls',sort:'date-desc',applies:['sector','company','status','role','period'],
   columns:[['date','Date'],['company','Entreprise'],['sector','Secteur'],['phone','Téléphone appelé'],['email','E-mail de prospection'],['outcome','Résultat de l’appel'],['recallDate','Date de rappel'],['recallTitle','Objet du rappel'],['note','Commentaire'],['sent','Plaquette envoyée'],['contact','Contact créé']],
   rows(L){return (Array.isArray(db.coldCalls)?db.coldCalls:[]).map(call=>{const contact=by(call.contactId),ctx=contactCtx(L,contact,call.company,call.date);ctx.sector=clean(call.sector)||L.sectorOf(call.company);
    return {ctx,cells:{date:excel(call.date),company:call.company||'',sector:ctx.sector,phone:call.phone||'',email:call.email||'',outcome:call.outcome||'',recallDate:excel(isRecallOutcome(call.outcome)?coldCallRecall(call)?.date:''),recallTitle:isRecallOutcome(call.outcome)?(coldCallRecall(call)?.title||''):'',note:call.note||'',sent:call.commercialEmailSent===true?'Oui':call.commercialEmailSent===false?'Non':'Non renseigné',contact:contact?.name||''}}})}},
  followups:{label:'Relances',sort:'date-desc',applies:['sector','company','status','role','period'],
   columns:[['title','Objet'],['date','Date prévue'],['state','État'],['completedAt','Date de fin'],['contact','Contact'],['company','Entreprise'],['sector','Secteur'],['role','Fonction'],['status','Statut commercial']],
   rows(L){const today=localDay(new Date());return db.followups.map(f=>{const contact=by(f.contactId),ctx=contactCtx(L,contact,null,f.date);
    return {ctx,cells:{title:f.title||'',date:excel(f.date),state:f.done?'Terminée':reportDay(f.date)&&reportDay(f.date)<today?'En retard':'À faire',completedAt:excel(f.completedAt),contact:contact?.name||'',company:contact?.company||'',sector:ctx.sector,role:contact?.role||'',status:contact?(contact.status||'À qualifier'):''}}})}},
  projects:{label:'Projets',sort:'date-desc',applies:['sector','company','status','role','period'],
   columns:[['title','Projet'],['date','Date'],['contact','Contact'],['company','Entreprise'],['sector','Secteur'],['quoteRef','Référence devis'],['priceHT','Prix HT'],['priceTTC','Prix TTC'],['attendees','Participants'],['seminarRoom','Salle de séminaire'],['accommodation','Hébergement'],['catering','Restauration'],['notes','Notes']],
   rows(L){return (Array.isArray(db.projects)?db.projects:[]).map(p=>{const contact=by(p.contactId),ctx=contactCtx(L,contact,p.companyName,p.date);
    return {ctx,cells:{title:p.title||'',date:excel(p.date),contact:contact?.name||p.contactName||'',company:p.companyName||'',sector:ctx.sector,quoteRef:p.quoteRef||'',priceHT:p.priceHT??'',priceTTC:p.priceTTC??'',attendees:p.attendees??'',seminarRoom:yesNo(!!p.seminarRoom),accommodation:yesNo(!!p.accommodation),catering:yesNo(!!p.catering),notes:p.notes||''}}})}},
  companies:{label:'Entreprises',sort:'company',applies:['sector','company'],
   columns:[['name','Entreprise'],['sector','Secteur'],['phone','Téléphone'],['email','E-mail'],['website','Site web'],['address','Adresse'],['postalCode','Code postal'],['city','Ville'],['country','Pays'],['siret','SIRET'],['siren','SIREN'],['vat','TVA'],['size','Effectif'],['notes','Notes'],['contacts','Nombre de contacts']],
   rows(L){return [...L.directory.values()].map(co=>{const sector=clean(co.sector)||L.sectorOf(co.name),n=db.contacts.filter(c=>companyKey(c.company)===companyKey(co.name)).length;
    return {ctx:{sector,company:clean(co.name),status:'',role:'',date:''},cells:{name:co.name||'',sector,phone:co.phone||'',email:co.email||'',website:co.website||'',address:co.address||'',postalCode:co.postalCode||'',city:co.city||'',country:co.country||'',siret:co.siret||'',siren:co.siren||'',vat:co.vat||'',size:co.size||'',notes:co.notes||'',contacts:n}}})}}
 };
 const GROUPS={sector:'Secteur d’activité',company:'Entreprise',status:'Statut commercial',role:'Fonction',month:'Mois',none:'Aucune (une seule page)'};
 const SORTS={'company':'Entreprise (A → Z)','date-desc':'Date (la plus récente d’abord)','date-asc':'Date (la plus ancienne d’abord)'};
 const FILTERS={sector:'Secteurs d’activité',company:'Entreprises',status:'Statuts commerciaux',role:'Fonctions'};

 // ---------- Listes à choix multiples ----------
 function multiselect(title){
  const box=document.createElement('details');box.className='rt-multi';
  const summary=document.createElement('summary'),body=document.createElement('div'),tools=document.createElement('div'),search=document.createElement('input'),all=document.createElement('button'),none=document.createElement('button'),list=document.createElement('div');
  body.className='rt-multi-body';tools.className='rt-multi-tools';list.className='rt-multi-list';
  search.type='search';search.placeholder='Rechercher…';search.setAttribute('aria-label','Rechercher dans '+title);
  for(const [button,text] of [[all,'Tout cocher'],[none,'Tout décocher']]){button.type='button';button.className='close';button.textContent=text}
  tools.append(search,all,none);body.append(tools,list);box.append(summary,body);
  let items=[];const unchecked=new Set(),rows=new Map();
  const count=()=>items.filter(i=>!unchecked.has(i.key)).length;
  const paint=()=>{summary.textContent=`${title} — ${count()} sur ${items.length}`};
  const visible=()=>[...rows.values()].filter(r=>!r.label.hidden);
  const touch=()=>{paint();form.dispatchEvent(new Event('rt-change'))};
  search.oninput=()=>{const q=search.value.trim().toLocaleLowerCase('fr');for(const r of rows.values())r.label.hidden=!!q&&!r.text.includes(q)};
  all.onclick=()=>{for(const r of visible()){unchecked.delete(r.key);r.input.checked=true}touch()};
  none.onclick=()=>{for(const r of visible()){unchecked.add(r.key);r.input.checked=false}touch()};
  return {el:box,
   set(next){items=next;rows.clear();list.replaceChildren();for(const item of items){const label=document.createElement('label'),input=document.createElement('input'),span=document.createElement('span');label.className='check-label';input.type='checkbox';input.checked=!unchecked.has(item.key);span.textContent=item.label;label.append(input,span);list.append(label);rows.set(item.key,{key:item.key,label,input,text:item.label.toLocaleLowerCase('fr')});input.onchange=()=>{input.checked?unchecked.delete(item.key):unchecked.add(item.key);touch()}}search.value='';paint()},
   selected(){return items.some(i=>unchecked.has(i.key))?new Set(items.filter(i=>!unchecked.has(i.key)).map(i=>i.key)):null}
  };
 }

 // ---------- Construction du formulaire ----------
 const options=(map,selected)=>Object.entries(map).map(([k,v])=>`<option value="${k}"${k===selected?' selected':''}>${v}</option>`).join('');
 form.innerHTML=`<p class="eyebrow">EN TEST</p><h3>Rapport test</h3><p class="hint">Rapport personnalisable : choisissez les données, les filtres, la répartition en pages (onglets), les colonnes et le tri. Le rapport ci-dessous reste inchangé.</p>
  <div class="rt-grid"><label>Données à exporter<select name="dataset">${Object.entries(DATASETS).map(([k,d])=>`<option value="${k}">${d.label}</option>`).join('')}</select></label><label>Une page (onglet) par<select name="group">${options(GROUPS,'sector')}</select></label><label>Trier chaque page par<select name="sort">${options(SORTS,'company')}</select></label></div>
  <fieldset class="rt-fieldset"><legend>Filtres</legend><p class="hint">Cochez uniquement les valeurs à exporter. Tout est coché par défaut.</p><div id="rt-filters" class="rt-filters"></div><div class="form-grid rt-period"><label>Date à partir du<input name="from" type="date"></label><label>Date jusqu’au<input name="to" type="date"></label></div><p id="rt-na" class="hint"></p></fieldset>
  <fieldset class="rt-fieldset"><legend>Colonnes à inclure</legend><div id="rt-columns" class="rt-columns"></div><div class="rt-col-actions"><button type="button" class="close" id="rt-cols-all">Tout cocher</button><button type="button" class="close" id="rt-cols-none">Tout décocher</button></div></fieldset>
  <label class="check-label"><input type="checkbox" name="summary" checked> Ajouter une page « Synthèse » (nombre de lignes par page et critères choisis)</label>
  <label class="check-label" id="rt-notes-label"><input type="checkbox" name="notes"> Inclure aussi les notes dans l’historique des contacts</label>
  <p id="rt-count" class="hint" role="status"></p><button type="submit">Télécharger le rapport test</button><p id="rt-message" class="hint" role="status"></p>`;
 const multis={};for(const [key,title] of Object.entries(FILTERS)){multis[key]=multiselect(title);$('rt-filters').append(multis[key].el)}
 const columnSelection={};for(const [key,d] of Object.entries(DATASETS))columnSelection[key]=new Set(d.columns.map(c=>c[0]));

 function drawColumns(){
  const dataset=form.elements.dataset.value,box=$('rt-columns');box.replaceChildren();
  for(const [key,label] of DATASETS[dataset].columns){const l=document.createElement('label'),input=document.createElement('input'),span=document.createElement('span');l.className='check-label';input.type='checkbox';input.checked=columnSelection[dataset].has(key);span.textContent=label;l.append(input,span);input.onchange=()=>{input.checked?columnSelection[dataset].add(key):columnSelection[dataset].delete(key);update()};box.append(l)}
 }
 function drawApplicability(){
  const d=DATASETS[form.elements.dataset.value];
  for(const [key,m] of Object.entries(multis))m.el.hidden=!d.applies.includes(key);
  document.querySelector('.rt-period').hidden=!d.applies.includes('period');
  $('rt-notes-label').hidden=form.elements.dataset.value!=='contacts';
  const off=Object.keys(FILTERS).filter(k=>!d.applies.includes(k)).map(k=>FILTERS[k].toLocaleLowerCase('fr'));if(!d.applies.includes('period'))off.push('dates');
  $('rt-na').textContent=off.length?`Non applicable à « ${d.label} » : ${off.join(', ')}.`:'';
 }
 // Listes de valeurs proposées par filtre, à partir des données actuelles.
 function refresh(){
  const L=lookups(),calls=Array.isArray(db.coldCalls)?db.coldCalls:[],projects=Array.isArray(db.projects)?db.projects:[],found={sector:new Map(),company:new Map(),status:new Map(),role:new Map()};
  const add=(kind,value,raw=false)=>{const label=clean(value);if(!label)return;const key=raw?label:norm(label);if(!found[kind].has(key))found[kind].set(key,label)};
  for(const [,co] of L.directory){add('company',co.name);add('sector',co.sector)}
  for(const c of db.contacts){add('company',c.company);add('role',c.role);add('status',c.status||'À qualifier',true)}
  for(const call of calls){add('company',call.company);add('sector',call.sector)}
  for(const p of projects)add('company',p.companyName);
  for(const s of commercialStatuses)add('status',s,true);
  const blank={sector:'(Sans secteur)',company:'(Sans entreprise)',status:'(Sans statut)',role:'(Sans fonction)'};
  for(const [kind,map] of Object.entries(found)){const list=[...map].map(([key,label])=>({key,label})).sort((a,b)=>kind==='status'?commercialStatuses.indexOf(a.key)-commercialStatuses.indexOf(b.key)||fr(a.label,b.label):fr(a.label,b.label));list.push({key:'',label:blank[kind]});multis[kind].set(list)}
  update();
 }

 // ---------- Calcul du rapport ----------
 function build(){
  const dataset=form.elements.dataset.value,d=DATASETS[dataset],L=lookups(),group=form.elements.group.value,sort=form.elements.sort.value,from=form.elements.from.value,to=form.elements.to.value;
  const sel={};for(const k of Object.keys(FILTERS))sel[k]=d.applies.includes(k)?multis[k].selected():null;
  const usePeriod=d.applies.includes('period')&&(from||to);
  const columns=d.columns.filter(c=>columnSelection[dataset].has(c[0]));
  let rows=d.rows(L,{notes:form.elements.notes.checked}).filter(r=>{
   const c=r.ctx;
   if(sel.sector&&!sel.sector.has(norm(c.sector)))return false;
   if(sel.company&&!sel.company.has(norm(c.company)))return false;
   if(sel.status&&!sel.status.has(c.status))return false;
   if(sel.role&&!sel.role.has(norm(c.role)))return false;
   if(usePeriod){const day=reportDay(c.date);if(!day||(from&&day<from)||(to&&day>to))return false}
   return true});
  for(const r of rows)r.day=reportDay(r.ctx.date)||'';
  const bySortDate=(a,b)=>(!a.day-!b.day)||(sort==='date-asc'?a.day.localeCompare(b.day):b.day.localeCompare(a.day));
  rows.sort(sort==='company'?(a,b)=>fr(a.ctx.company,b.ctx.company)||(!a.day-!b.day)||b.day.localeCompare(a.day):bySortDate);
  const groups=new Map(),blankLabel={sector:'Sans secteur',company:'Sans entreprise',status:'Sans statut',role:'Sans fonction',month:'Sans date',none:d.label};
  for(const r of rows){
   let key,label;
   if(group==='none'){key='';label=d.label}
   else if(group==='month'){key=r.day.slice(0,7);label=key?new Intl.DateTimeFormat('fr-FR',{month:'long',year:'numeric'}).format(new Date(+key.slice(0,4),+key.slice(5,7)-1,1)):blankLabel.month}
   else{const raw=group==='status'?r.ctx.status:clean(r.ctx[group]);key=group==='status'?raw:norm(raw);label=raw||blankLabel[group]}
   if(!groups.has(key))groups.set(key,{key,label,rows:[]});groups.get(key).rows.push(r);
  }
  const ordered=[...groups.values()].sort((a,b)=>(!a.key-!b.key)||(group==='month'?a.key.localeCompare(b.key):fr(a.label,b.label)));
  return {d,dataset,columns,rows,groups:ordered,group,from,to,sel};
 }
 function update(){
  const r=build(),text=!r.columns.length?'Aucune colonne sélectionnée.':r.rows.length?`${r.rows.length} ligne(s) dans ${r.groups.length} page(s) pour « ${r.d.label} ».`:'Aucune ligne ne correspond à ces critères.';
  $('rt-count').textContent=text;return r;
 }

 form.addEventListener('rt-change',update);
 form.elements.dataset.onchange=()=>{form.elements.sort.value=DATASETS[form.elements.dataset.value].sort;drawApplicability();drawColumns();update()};
 for(const name of ['group','sort','from','to','notes'])form.elements[name].onchange=update;
 $('rt-cols-all').onclick=()=>{const k=form.elements.dataset.value;columnSelection[k]=new Set(DATASETS[k].columns.map(c=>c[0]));drawColumns();update()};
 $('rt-cols-none').onclick=()=>{columnSelection[form.elements.dataset.value]=new Set();drawColumns();update()};

 form.onsubmit=async e=>{
  e.preventDefault();const message=$('rt-message'),r=update();message.textContent='';
  if(r.from&&r.to&&r.from>r.to){message.textContent='La date de début doit précéder la date de fin.';return}
  if(!r.columns.length){message.textContent='Sélectionnez au moins une colonne.';return}
  if(!r.rows.length){message.textContent='Aucune ligne ne correspond à ces critères.';return}
  const used=new Set(),sheets=[];
  if(form.elements.summary.checked){
   const names=new Map(),summary=[['Page','Nombre de lignes']];
   const sheet={name:reportSheetName('Synthèse',used),rows:summary};sheets.push(sheet);
   for(const g of r.groups){names.set(g.key,reportSheetName(g.label,used));summary.push([names.get(g.key),g.rows.length])}
   summary.push(['Total',r.rows.length],['',''],['Données',r.d.label],['Une page par',GROUPS[r.group]],['Généré le',displayDate(new Date().toISOString())]);
   if(r.from||r.to)summary.push(['Période',`${r.from?displayDate(r.from):'…'} → ${r.to?displayDate(r.to):'…'}`]);
   for(const [k,title] of Object.entries(FILTERS)){const chosen=r.sel[k];if(chosen)summary.push([title,`${chosen.size} valeur(s) sélectionnée(s)`])}
   r._names=names;
  }
  for(const g of r.groups)sheets.push({name:r._names?.get(g.key)||reportSheetName(g.label,used),rows:[r.columns.map(c=>c[1]),...g.rows.map(row=>r.columns.map(([key])=>row.cells[key]??''))]});
  if(sheets.some(s=>s.rows.some(row=>row.some(v=>String(v??'').length>32767)))){message.textContent='Export impossible : une donnée dépasse la taille maximale d’une cellule Excel.';return}
  try{const blob=await createWorkbook(sheets),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`rapport-test-${localDay(new Date())}.xlsx`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);message.textContent=`Rapport téléchargé : ${r.rows.length} ligne(s), ${r.groups.length} page(s).`}
  catch(error){message.textContent='Impossible de créer le rapport : '+error.message}
 };

 const renderBeforeReportTest=render;render=function(){renderBeforeReportTest();if(!$('reports-view').hidden)refresh()};
 document.querySelector('[data-view="reports"]').addEventListener('click',refresh);
 form.elements.sort.value=DATASETS.contacts.sort;drawApplicability();drawColumns();refresh();
})();
