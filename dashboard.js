const GOALS_KEY='bb-crm-goals-v1';
let goals={calls:150,interactions:200,followups:50,...JSON.parse(localStorage.getItem(GOALS_KEY)||'{}')};
const chartDate=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
function drawDashboard(){
  const now=new Date(),days=Array.from({length:7},(_,i)=>{const d=new Date(now.getFullYear(),now.getMonth(),now.getDate()-6+i);return {day:d,key:chartDate(d),count:0}});
  const monthStart=new Date(now.getFullYear(),now.getMonth(),1),monthEnd=new Date(now.getFullYear(),now.getMonth()+1,1);
  const inMonth=value=>{const d=new Date(value);return Number.isFinite(d.getTime())&&d>=monthStart&&d<monthEnd};
  const recentStart=days[0].day;
  $('new-contact-count').textContent=db.contacts.filter(c=>c.createdAt&&new Date(c.createdAt)>=recentStart&&new Date(c.createdAt)<=now).length;
  const coldCalls=Array.isArray(db.coldCalls)?db.coldCalls:[],coldIds=new Set(coldCalls.map(call=>call.id));
  const calls=[...coldCalls,...db.interactions.filter(i=>i.type==='Appel'&&!coldIds.has(i.coldCallId))];
  calls.forEach(i=>{const d=new Date(i.date);if(!Number.isFinite(d.getTime())||d>now)return;const day=days.find(x=>x.key===chartDate(d));if(day)day.count++});
  const chart=$('weekly-chart');chart.replaceChildren();const max=Math.max(1,...days.map(d=>d.count));
  days.forEach(d=>{const col=document.createElement('div');col.className='chart-column';const value=document.createElement('span');value.className='chart-value';value.textContent=d.count;const bar=document.createElement('div');bar.className='chart-bar';bar.style.height=`${d.count?Math.max(5,d.count/max*100):0}%`;const track=document.createElement('div');track.className='chart-track';track.append(bar);const label=document.createElement('span');label.className='chart-label';label.textContent=new Intl.DateTimeFormat('fr-FR',{weekday:'short',day:'numeric'}).format(d.day);col.append(value,track,label);chart.append(col)});
  chart.setAttribute('aria-label','Appels sur sept jours : '+days.map(d=>`${new Intl.DateTimeFormat('fr-FR',{weekday:'long',day:'numeric',month:'long'}).format(d.day)} : ${d.count}`).join(', '));
  const stats=[['Appels',calls.filter(i=>inMonth(i.date)).length,goals.calls],['Interactions',db.interactions.filter(i=>inMonth(i.date)).length,goals.interactions],['Relances terminées',db.followups.filter(f=>f.done&&f.completedAt&&inMonth(f.completedAt)).length,goals.followups]];
  const container=$('monthly-stats');container.replaceChildren();stats.forEach(([name,count,goal])=>{const row=document.createElement('div');row.className='goal-row';const heading=document.createElement('div');heading.className='goal-heading';const label=document.createElement('strong');label.textContent=name;const percent=document.createElement('strong');percent.textContent=Math.round(count/goal*100)+' %';heading.append(label,percent);const detail=document.createElement('p');detail.className='hint';detail.textContent=`${count} / ${goal} réalisés`;const track=document.createElement('div');track.className='goal-track';const fill=document.createElement('div');fill.style.width=Math.min(100,count/goal*100)+'%';track.append(fill);row.append(heading,detail,track);container.append(row)});
}
const originalRender=render;render=function(){originalRender();drawDashboard()};
for(const name of ['calls','interactions','followups'])$('goal-'+name).value=goals[name];
$('goals-form').onsubmit=e=>{e.preventDefault();goals={calls:Number($('goal-calls').value),interactions:Number($('goal-interactions').value),followups:Number($('goal-followups').value)};localStorage.setItem(GOALS_KEY,JSON.stringify(goals));drawDashboard();$('goals-message').textContent='Objectifs enregistrés.'};
drawDashboard();
