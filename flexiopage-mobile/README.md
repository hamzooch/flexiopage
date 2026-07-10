# FlexioPage Mobile (app marchands)

App mobile **React Native (Expo)** pour les vendeurs FlexioPage. Elle consomme
la **même API REST** que le dashboard web (`flexiopage-backend`) — aucun nouveau
backend. Authentification par **JWT Bearer** (le backend l'accepte déjà via le
header `Authorization`, cf. `auth.middleware.ts`).

## MVP actuel

- 🔐 **Login** (`POST /api/auth/login`) — JWT stocké chiffré dans le Keychain/Keystore (`expo-secure-store`)
- 🏪 **Sélection de boutique** (`GET /api/users/stores`)
- 📦 **Commandes** : liste (`GET /api/stores/:id/orders`), détail (`GET …/orders/:orderId`)
- 🔁 **Changement de statut** paiement / expédition (`PATCH …/orders/:orderId/manual-status`)

## Stack

| | |
|---|---|
| Runtime | Expo SDK 52 (React Native 0.76, New Architecture) |
| Langage | TypeScript |
| Navigation | React Navigation (native-stack) |
| État | Zustand (+ persist AsyncStorage) |
| HTTP | Axios (mêmes namespaces que le web : `authApi`, `usersApi`, `ordersApi`) |
| Token | `expo-secure-store` (Keychain iOS / Keystore Android) |

## Installation

```bash
cd flexiopage-mobile
npm install
# aligne les versions natives sur la version exacte d'Expo installée :
npx expo install --fix
```

## Configuration de l'URL du backend

L'app lit l'URL de l'API dans `app.json` → `expo.extra.apiUrl` (par défaut
`http://localhost:5000`).

> ⚠️ Sur un **téléphone physique**, `localhost` = le téléphone lui-même.
> Mets l'**IP LAN de ta machine** (ex. `http://192.168.1.20:5000`) dans
> `app.json`, et assure-toi que le backend écoute sur `0.0.0.0` et que le
> téléphone est sur le même Wi-Fi. Le simulateur iOS, lui, accepte `localhost`.

## Lancer

```bash
# Backend (dans un autre terminal)
cd ../flexiopage-backend && npm run dev

# App mobile
npm start            # puis 'i' (iOS), 'a' (Android), ou scanne le QR avec Expo Go
```

## Builds stores (plus tard)

Via **EAS Build** (pas besoin de Mac/Xcode local) :

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build --platform all --profile preview
```

## Prochaines étapes (roadmap)

1. **Notifications push** (Expo Push) — enregistrer le push-token de l'appareil
   côté backend + envoyer « Nouvelle commande #1234 » via la file BullMQ existante.
   → c'est *la* valeur ajoutée du mobile.
2. Onglet **Produits** (édition rapide stock / prix).
3. Onglet **Stats** (`GET /api/stores/:id/analytics`).
4. Confirmation d'appel COD (`PATCH …/orders/:orderId/confirmation`) — l'API
   client est déjà câblée (`ordersApi.setConfirmation`), reste l'UI.
5. **Refresh token** : aujourd'hui le JWT expire à 7 jours → reconnexion.
   Envisager un refresh-token longue durée pour éviter les déconnexions.

## Structure

```
flexiopage-mobile/
├── App.tsx                  # boot : charge le token + attend l'hydratation
├── index.ts                 # registerRootComponent
├── app.json                 # config Expo (+ extra.apiUrl)
└── src/
    ├── lib/
    │   ├── config.ts        # API_URL depuis expo.extra
    │   ├── token.ts         # JWT dans SecureStore (+ cache mémoire sync)
    │   └── api.ts           # client Axios (authApi, usersApi, ordersApi)
    ├── stores/
    │   ├── auth-store.ts     # user + isAuthenticated (persist AsyncStorage)
    │   └── store-store.ts    # boutique sélectionnée
    ├── navigation/
    │   ├── types.ts
    │   └── RootNavigator.tsx # bascule Login ⇄ écrans authentifiés
    ├── screens/
    │   ├── LoginScreen.tsx
    │   ├── SelectStoreScreen.tsx
    │   ├── OrdersScreen.tsx
    │   └── OrderDetailScreen.tsx
    ├── components/Badge.tsx
    ├── types/index.ts        # types alignés sur les models backend
    └── theme.ts
```
