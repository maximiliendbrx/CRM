// Fiche entreprise : ajouter un collaborateur, et ajouter un projet assigné à une ou plusieurs personnes de l'entreprise.
// Le premier assigné (dans l'ordre de la liste) est le contact principal du projet ; les autres sont dans participantIds.
(function(){
 const renderBefore=renderCompanyProfile;
 renderCompanyProfile=function(target,company,key,contacts,directory){
  renderBefore(target,company,key,contacts,directory);
  const card=target.querySelector('.company-profile');if(!card)return;
  addCollaboratorForm(card,company);
  addProjectForm(card,company,contacts);
 };

 function field(label,name,type='text',attributes={}){
  const wrapper=document.createElement('label'),input=document.createElement('input');wrapper.append(label);input.name=name;input.type=type;
  for(const [k,v] of Object.entries(attributes))input.setAttribute(k,v);wrapper.append(input);return wrapper;
 }
 function toggleButton(text,form){
  const button=document.createElement('button');button.type='button';button.className='company-add-button';button.textContent=text;button.setAttribute('aria-expanded','false');
  button.onclick=()=>{form.hidden=!form.hidden;button.setAttribute('aria-expanded',String(!form.hidden));if(!form.hidden)form.querySelector('input').focus()};
  return button;
 }
 function messageLine(className){const p=document.createElement('p');p.className='hint '+className;p.setAttribute('role','status');return p}

 // ---------- Collaborateur ----------
 function addCollaboratorForm(card,company){
  const section=card.querySelector('.company-contact-section');if(!section)return;
  const form=document.createElement('form');form.className='company-inline-form';form.hidden=true;
  const heading=document.createElement('h4');heading.textContent='Nouveau collaborateur';
  const grid=document.createElement('div');grid.className='form-grid';
  grid.append(field('Nom et prénom','name','text',{required:'',autocomplete:'off'}),field('Fonction','role','text',{autocomplete:'off'}),field('Téléphone','phone','tel'),field('E-mail','email','email'));
  const submit=document.createElement('button');submit.type='submit';submit.textContent='Ajouter le collaborateur';
  const cancel=document.createElement('button');cancel.type='button';cancel.className='close';cancel.textContent='Annuler';cancel.onclick=()=>{form.reset();form.hidden=true;toggle.setAttribute('aria-expanded','false')};
  const message=messageLine('company-collab-message');
  form.append(heading,grid,submit,cancel);
  const toggle=toggleButton('Ajouter un collaborateur',form);
  section.append(toggle,form,message);
  form.onsubmit=e=>{
   e.preventDefault();const data=Object.fromEntries(new FormData(form)),name=data.name.trim();
   if(!name){message.textContent='Renseignez le nom et le prénom.';return}
   if(findSameContact(name,company.name)){message.textContent='Ce collaborateur existe déjà dans cette entreprise.';return}
   db.contacts.push({id:crypto.randomUUID(),createdAt:new Date().toISOString(),name,company:company.name,phone:data.phone.trim(),email:data.email.trim(),role:data.role.trim(),status:'À qualifier'});
   save();render();
   const after=document.querySelector('.company-collab-message');if(after)after.textContent='Collaborateur ajouté : '+name+'.';
  };
 }

 // ---------- Projet assigné à une ou plusieurs personnes ----------
 function addProjectForm(card,company,contacts){
  const section=card.querySelector('.profile-projects');if(!section)return;
  const form=document.createElement('form');form.className='company-inline-form';form.hidden=true;
  const heading=document.createElement('h4');heading.textContent='Nouveau projet';
  const grid=document.createElement('div');grid.className='form-grid';
  grid.append(field('Nom du projet','title','text',{required:'',autocomplete:'off'}),field('Date du projet','date','date',{required:''}),field('Référence du devis','quoteRef'),field('Prix HT (€)','priceHT','number',{min:'0',step:'0.01',inputmode:'decimal'}),field('Prix TTC (€)','priceTTC','number',{min:'0',step:'0.01',inputmode:'decimal'}),field('Nombre de personnes','attendees','number',{min:'0',step:'1',inputmode:'numeric'}));
  const services=document.createElement('fieldset');services.className='project-options';const legend=document.createElement('legend');legend.textContent='Prestations';services.append(legend);
  for(const [name,label] of [['seminarRoom','Salle de séminaire'],['accommodation','Hébergement'],['catering','Restauration']]){const l=document.createElement('label'),i=document.createElement('input');l.className='check-label';i.type='checkbox';i.name=name;l.append(i,' '+label);services.append(l)}
  const notesLabel=document.createElement('label'),notes=document.createElement('textarea');notes.name='notes';notesLabel.append('Notes (facultatif)',notes);
  // Personnes assignées : au moins une ; la première cochée devient le contact principal.
  const assignees=document.createElement('fieldset');assignees.className='participant-picker project-assignees';const assigneesLegend=document.createElement('legend');assigneesLegend.textContent='Personnes assignées au projet';assignees.append(assigneesLegend);
  const list=document.createElement('div');list.className='participant-list';assignees.append(list);const hint=document.createElement('p');hint.className='hint';assignees.append(hint);
  for(const c of contacts){const l=document.createElement('label'),i=document.createElement('input'),t=document.createElement('span');l.className='check-label';i.type='checkbox';i.value=c.id;i.checked=contacts.length===1;t.textContent=c.name+(c.role?' — '+c.role:'');l.append(i,t);list.append(l)}
  hint.textContent=contacts.length?'Cochez une ou plusieurs personnes de cette entreprise.':'Aucun collaborateur dans cette entreprise : ajoutez-en un d’abord.';
  const submit=document.createElement('button');submit.type='submit';submit.textContent='Enregistrer le projet';submit.disabled=!contacts.length;
  const cancel=document.createElement('button');cancel.type='button';cancel.className='close';cancel.textContent='Annuler';
  const message=messageLine('company-project-message');
  form.append(heading,grid,services,notesLabel,assignees,submit,cancel);
  const toggle=toggleButton('Ajouter un projet',form);
  cancel.onclick=()=>{form.reset();form.hidden=true;toggle.setAttribute('aria-expanded','false')};
  section.querySelector('h4').after(toggle,form,message);
  form.onsubmit=e=>{
   e.preventDefault();const data=Object.fromEntries(new FormData(form)),title=data.title.trim();
   const ids=[...list.querySelectorAll('input:checked')].map(i=>i.value).filter(id=>by(id));
   if(!title){message.textContent='Renseignez le nom du projet.';return}
   if(!data.date){message.textContent='Renseignez la date du projet.';return}
   if(!ids.length){message.textContent='Assignez le projet à au moins une personne.';return}
   const main=by(ids[0]),number=value=>value===''?'':Number(value);
   const project={id:crypto.randomUUID(),contactId:main.id,contactName:main.name,companyName:company.name,title,date:data.date,quoteRef:data.quoteRef.trim(),priceHT:number(data.priceHT),priceTTC:number(data.priceTTC),attendees:number(data.attendees),seminarPackage:false,seminarRoom:form.elements.seminarRoom.checked,accommodation:form.elements.accommodation.checked,catering:form.elements.catering.checked,notes:data.notes.trim()};
   if(ids.length>1)project.participantIds=ids.slice(1);
   if(!Array.isArray(db.projects))db.projects=[];db.projects.push(project);
   save();render();
   const after=document.querySelector('.company-project-message');if(after)after.textContent='Projet enregistré pour '+ids.map(id=>by(id).name).join(', ')+'.';
  };
 }
})();
