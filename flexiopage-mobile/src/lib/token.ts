import * as SecureStore from 'expo-secure-store';

/**
 * JWT storage for the mobile app.
 *
 * Le backend FlexioPage accepte le token via `Authorization: Bearer <jwt>`
 * (cf. auth.middleware.ts). On NE PEUT PAS s'appuyer sur le cookie httpOnly
 * comme le web : un client natif n'a pas de cookie jar de navigateur. On
 * stocke donc le JWT dans le Keychain iOS / Keystore Android via SecureStore.
 *
 * L'intercepteur Axios doit lire le token de manière SYNCHRONE à chaque
 * requête. SecureStore est asynchrone → on garde un cache mémoire
 * (`currentToken`) hydraté une fois au démarrage (loadToken) puis maintenu
 * à jour par setToken/clearToken.
 */

const TOKEN_KEY = 'flexiopage_jwt';

let currentToken: string | null = null;

/** Lecture synchrone — utilisée par l'intercepteur Axios. */
export function getToken(): string | null {
  return currentToken;
}

/** À appeler UNE fois au boot de l'app, avant le premier render. */
export async function loadToken(): Promise<string | null> {
  try {
    currentToken = await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    currentToken = null;
  }
  return currentToken;
}

export async function setToken(token: string): Promise<void> {
  currentToken = token;
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  currentToken = null;
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}
