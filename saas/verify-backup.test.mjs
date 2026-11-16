import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectBackup } from './verify-backup.mjs';
const base=()=>({version:1,data:{contacts:[{id:'c'}],interactions:[{id:'i',contactId:'c'}],followups:[]}});
test('accepte une sauvegarde historique sans collections facultatives',()=>{const result=inspectBackup(base());assert.deepEqual(result.errors,[]);assert.equal(result.counts.contacts,1);assert.equal(result.counts.projects,0)});
test('détecte les doublons sans afficher leur valeur',()=>{const data=base();data.data.contacts.push({id:'secret'} ,{id:'secret'});const result=inspectBackup(data);assert(result.errors.includes('Identifiant dupliqué dans contacts'));assert(!JSON.stringify(result).includes('secret'))});
test('signale les références orphelines',()=>{const data=base();data.data.interactions[0].contactId='absent';assert(inspectBackup(data).warnings.some(w=>w.includes('contact absent')))});
test('refuse un format invalide',()=>assert.throws(()=>inspectBackup({version:2,data:{}})));
