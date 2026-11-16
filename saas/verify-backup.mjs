#!/usr/bin/env node
// Vérification locale en lecture seule. Ne journalise jamais les données commerciales.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const require=createRequire(import.meta.url);
const JSZip=require('../vendor/jszip.min.js');
const COLLECTIONS=['contacts','companies','interactions','coldCalls','followups','projects'];
export function inspectBackup(backup){
 if(!backup||backup.version!==1||!backup.data||typeof backup.data!=='object'||Array.isArray(backup.data))throw Error('Format de sauvegarde inconnu : version 1 et objet data attendus.');
 const data=backup.data,errors=[],warnings=[],counts={};
 for(const key of COLLECTIONS){const value=data[key];if(value===undefined){if(['contacts','interactions','followups'].includes(key))errors.push(`Collection obligatoire absente : ${key}`);else counts[key]=0;continue}if(!Array.isArray(value)){errors.push(`Collection non valide : ${key}`);continue}counts[key]=value.length;const ids=new Set();for(const item of value){if(!item||typeof item!=='object'||Array.isArray(item)){errors.push(`Élément non valide dans ${key}`);continue}if(typeof item.id!=='string'||!item.id.trim()){if(key==='companies')warnings.push('Une entreprise sans identifiant devra être rapprochée par son nom.');else errors.push(`Identifiant absent dans ${key}`)}else if(ids.has(item.id))errors.push(`Identifiant dupliqué dans ${key}`);else ids.add(item.id)}}
 if(errors.length)return {counts,errors:[...new Set(errors)],warnings:[...new Set(warnings)]};
 const contacts=new Set(data.contacts.map(c=>c.id));for(const key of ['interactions','coldCalls','followups','projects'])for(const item of data[key]||[])if(item.contactId&&!contacts.has(item.contactId))warnings.push(`Référence à un contact absent dans ${key} : traitement manuel nécessaire.`);
 if(data.catalogs!==undefined&&(!data.catalogs||typeof data.catalogs!=='object'||Array.isArray(data.catalogs)))errors.push('Catalogue de fonctions et secteurs non valide.');
 return {counts,errors:[...new Set(errors)],warnings:[...new Set(warnings)]};
}
export async function readBackup(path){const bytes=await readFile(path),sha256=createHash('sha256').update(bytes).digest('hex');let content;if(bytes.length>=4&&bytes[0]===0x50&&bytes[1]===0x4b){const zip=await JSZip.loadAsync(bytes),file=zip.file('donnees-privees/donnees.json');if(!file)throw Error('Le ZIP ne contient pas donnees-privees/donnees.json.');content=await file.async('string')}else content=bytes.toString('utf8');let parsed;try{parsed=JSON.parse(content)}catch{throw Error('JSON de sauvegarde illisible.')}return {sha256,backup:parsed}}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{if(process.argv.length!==3)throw Error('Usage : node saas/verify-backup.mjs CHEMIN_VERS_LA_SAUVEGARDE');const {sha256,backup}=await readBackup(process.argv[2]),result=inspectBackup(backup);console.log(JSON.stringify({sha256,...result},null,2));if(result.errors.length)process.exitCode=1}catch(error){console.error(error.message);process.exitCode=1}}
