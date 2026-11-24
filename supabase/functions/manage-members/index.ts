// Fonction serveur Supabase (Edge Function) : gestion des accès au CRM partagé, réservée à l'administrateur.
// Actions : list, invite (crée un accès avec mot de passe temporaire), reset (nouveau mot de passe temporaire), remove.
// La clé secrète (service role) n'existe que côté serveur : elle ne doit jamais être placée dans le site.
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Mot de passe temporaire aléatoire (sans caractères ambigus), tirage sans biais.
export function tempPassword(length = 14) {
  const limit = 256 - (256 % ALPHABET.length);
  let out = '';
  while (out.length < length) {
    for (const byte of crypto.getRandomValues(new Uint8Array(length * 2))) {
      if (byte < limit && out.length < length) out += ALPHABET[byte % ALPHABET.length];
    }
  }
  return out;
}

export async function handle(req, deps) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée.' }, 405);
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Authentification requise.' }, 401);

  const admin = deps.createClient(deps.url, deps.serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: who, error: whoError } = await admin.auth.getUser(token);
  const caller = who?.user;
  if (whoError || !caller) return json({ error: 'Session invalide.' }, 401);
  const { data: me } = await admin.from('crm_members').select('role').eq('user_id', caller.id).maybeSingle();
  if (me?.role !== 'admin') return json({ error: 'Action réservée à l’administrateur.' }, 403);

  let body;
  try { body = await req.json(); } catch { return json({ error: 'Requête invalide.' }, 400); }

  try {
    if (body.action === 'list') {
      const { data, error } = await admin.from('crm_members').select('user_id,email,role,created_at').order('created_at');
      if (error) throw error;
      const members = [];
      for (const member of data || []) {
        const { data: found } = await admin.auth.admin.getUserById(member.user_id);
        members.push({ userId: member.user_id, email: member.email, role: member.role, createdAt: member.created_at, lastSignIn: found?.user?.last_sign_in_at || null });
      }
      return json({ members });
    }

    if (body.action === 'invite') {
      const email = String(body.email || '').trim().toLowerCase();
      if (!EMAIL.test(email) || email.length > 254) return json({ error: 'Adresse e-mail invalide.' }, 400);
      const password = tempPassword();
      const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { must_change_password: true } });
      if (error || !created?.user) {
        const already = /already|exists|registered/i.test(error?.message || '');
        return json({ error: already ? 'Un compte existe déjà avec cette adresse.' : 'Création du compte impossible.' }, already ? 409 : 500);
      }
      const { error: memberError } = await admin.from('crm_members').insert({ user_id: created.user.id, email, role: 'member' });
      if (memberError) {
        await admin.auth.admin.deleteUser(created.user.id);
        return json({ error: 'Création de l’accès impossible.' }, 500);
      }
      return json({ email, password });
    }

    if (body.action === 'reset' || body.action === 'remove') {
      const userId = String(body.userId || '');
      if (!UUID.test(userId)) return json({ error: 'Utilisateur invalide.' }, 400);
      if (userId === caller.id) return json({ error: 'Utilisez les Paramètres pour votre propre compte.' }, 400);
      const { data: target } = await admin.from('crm_members').select('email,role').eq('user_id', userId).maybeSingle();
      if (!target) return json({ error: 'Utilisateur introuvable.' }, 404);
      if (target.role === 'admin') return json({ error: 'Le compte administrateur ne peut pas être modifié ici.' }, 403);
      if (body.action === 'remove') {
        const { error } = await admin.auth.admin.deleteUser(userId);
        if (error) throw error;
        return json({ ok: true });
      }
      const password = tempPassword();
      const { error } = await admin.auth.admin.updateUserById(userId, { password, user_metadata: { must_change_password: true } });
      if (error) throw error;
      return json({ email: target.email, password });
    }

    return json({ error: 'Action inconnue.' }, 400);
  } catch (error) {
    console.error('manage-members', error?.message || error);
    return json({ error: 'Erreur du serveur.' }, 500);
  }
}

Deno.serve((req) => handle(req, {
  createClient,
  url: Deno.env.get('SUPABASE_URL'),
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
}));
