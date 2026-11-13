// OpenRouter for a page with no server: the visitor signs in with their own
// OpenRouter account (OAuth PKCE: no client secret, no registration) and the
// page gets a key of theirs, or they paste one. Then createBrain({ endpoint:
// openRouterEndpoint(key) }) talks to any OpenRouter model.
//
//   import { signIn, finishSignIn, openRouterEndpoint } from '@tablefolk/brain/openrouter.js';
//   button.onclick = () => signIn();                 // goes to OpenRouter, comes back with ?code=
//   const key = await finishSignIn();                // on the way back: the key (null if not returning)
//   const brain = await createBrain({ model: 'endpoint', endpoint: openRouterEndpoint(key) });
// Keep the key where you like (localStorage is the usual place); it goes only to OpenRouter.

export const OPENROUTER = 'https://openrouter.ai/api/v1';
export const QUICK_MODEL = 'google/gemma-4-26b-a4b-it';   // quick and cheap; any OpenRouter model id works
const VERIFIER = 'tfOpenRouterVerifier';
const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export async function signIn({ callbackUrl } = {}) {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  try { sessionStorage.setItem(VERIFIER, verifier); } catch {}
  const back = new URL(callbackUrl || location.href); back.searchParams.delete('code');
  location.href = 'https://openrouter.ai/auth?' + new URLSearchParams({ callback_url: back.href, code_challenge: challenge, code_challenge_method: 'S256' });
}

// Back from OpenRouter (?code=...): trade the code for the key; removes ?code
// from the address bar. null when this page load is not a return.
export async function finishSignIn() {
  const u = new URL(location.href), code = u.searchParams.get('code');
  let verifier = null; try { verifier = sessionStorage.getItem(VERIFIER); } catch {}
  if (!code || !verifier) return null;
  try { sessionStorage.removeItem(VERIFIER); } catch {}
  u.searchParams.delete('code'); history.replaceState(null, '', u.href);
  const r = await fetch(OPENROUTER + '/auth/keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: 'S256' }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.key) throw new Error('OpenRouter sign-in failed: ' + (d.error?.message || r.status));
  return d.key;
}

export const openRouterEndpoint = (apiKey, model = QUICK_MODEL) => ({ baseURL: OPENROUTER, apiKey, model });
