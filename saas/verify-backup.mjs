#!/usr/bin/env node
// Vérification locale en lecture seule. Ne journalise jamais les données commerciales.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const require=createRequire(import.meta.url);
const JSZip=require('../vendor/jszip.min.js');
import { inspectBackup } from './inspect-backup.mjs';
export { inspectBackup } from './inspect-backup.mjs';
export async function readBackup(path){const bytes=await readFile(path),sha256=createHash('sha256').update(bytes).digest('hex');let content;if(bytes.length>=4&&bytes[0]===0x50&&bytes[1]===0x4b){const zip=await JSZip.loadAsync(bytes),file=zip.file('donnees-privees/donnees.json');if(!file)throw Error('Le ZIP ne contient pas donnees-privees/donnees.json.');content=await file.async('string')}else content=bytes.toString('utf8');let parsed;try{parsed=JSON.parse(content)}catch{throw Error('JSON de sauvegarde illisible.')}return {sha256,backup:parsed}}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{if(process.argv.length!==3)throw Error('Usage : node saas/verify-backup.mjs CHEMIN_VERS_LA_SAUVEGARDE');const {sha256,backup}=await readBackup(process.argv[2]),result=inspectBackup(backup);console.log(JSON.stringify({sha256,...result},null,2));if(result.errors.length)process.exitCode=1}catch(error){console.error(error.message);process.exitCode=1}}
