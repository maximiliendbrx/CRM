import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createInvitationToken,hashInvitationToken,verifyInvitationToken} from './invitation-token.mjs';
test('génère des jetons distincts et non prédictibles de 256 bits',()=>{const a=createInvitationToken(),b=createInvitationToken();assert.match(a,/^[A-Za-z0-9_-]{43}$/);assert.notEqual(a,b);assert.equal(Buffer.from(a,'base64url').length,32)});
test('stocke un hash et vérifie le jeton associé',()=>{const token=createInvitationToken(),hash=hashInvitationToken(token);assert.match(hash,/^[a-f0-9]{64}$/);assert.notEqual(hash,token);assert.equal(verifyInvitationToken(token,hash),true);assert.equal(verifyInvitationToken(createInvitationToken(),hash),false)});
test('refuse les jetons et hashes malformés',()=>{assert.throws(()=>hashInvitationToken('trop-court'));assert.equal(verifyInvitationToken('trop-court','a'.repeat(64)),false);assert.equal(verifyInvitationToken(createInvitationToken(),'secret'),false)});
