// PostgreSQL local jetable, après workspace-changes.sql ; aucune donnée réelle.
import {spawn,execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const docker='crm-changes-local',database='test2';
const args=['exec','-i',docker,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',database];
const workspace=execFileSync('docker',args,{input:"select id from public.workspaces where name='CRM Modifications A';",encoding:'utf8'}).trim();
assert.match(workspace,/^[0-9a-f-]{36}$/);
const changes=JSON.stringify([{table:'companies',action:'update',id:'30000000-0000-0000-0000-000000000001',expected_version:3,row:{name:'Concurrence',data:{name:'Concurrence'}}}]);
const sql=`begin; set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000301',true); select public.apply_workspace_changes('${workspace}','${changes}'::jsonb); select pg_sleep(0.2); commit;`;
function run(){return new Promise((resolve,reject)=>{let out='';const p=spawn('docker',args);p.stderr.on('data',b=>out+=b);p.on('error',reject);p.on('close',code=>resolve({code,out}));p.stdin.end(sql)})}
const results=await Promise.all([run(),run()]);assert.equal(results.filter(r=>r.code===0).length,1);assert.equal(results.filter(r=>r.code!==0&&r.out.includes('Conflit')).length,1);
const version=execFileSync('docker',args,{input:"select version from public.companies where id='30000000-0000-0000-0000-000000000001';",encoding:'utf8'}).trim();assert.equal(version,'4');console.log('Écritures simultanées : un succès, un conflit, aucune modification perdue.');
