# Guide debug — Push notifications APK

Objectif : identifier pourquoi il y a 0 token Expo enregistré en prod, avec un APK installé sur un vrai téléphone Android.

## 1. Installation

1. Ouvre le lien d'installation sur le téléphone :
   `https://expo.dev/accounts/hamzooch/projects/flexiopage-mobile/builds/<BUILD_ID>`
2. Autorise "Installation depuis sources inconnues" si demandé
3. Ouvre l'app FlexioPage
4. **Accepte la demande de notifications** quand elle apparaît (crucial !)

## 2. Test rapide via le dashboard (le plus simple)

1. Dans l'app, connecte-toi avec ton compte
2. Va dans **Paramètres** (`/dashboard/settings`)
3. Section "Notifications" → clique le bouton **"Tester le son"**
4. Résultat attendu : notification reçue immédiatement, avec le son "cha-ching"

**Interprétation du diagnostic renvoyé** :

| Diagnostic | Signification | Action |
|-----------|---------------|--------|
| `ok` (sent > 0) | 🎉 Tout marche | Rien à faire |
| `no_device` | Aucun token enregistré côté user | Vérifier étapes 3–4 |
| `expo_error` | Token OK mais Expo Push rejette | Vérifier fingerprint app.json ↔ FCM |
| `unknown` | Cas rare | Voir logs backend |

## 3. Si "no_device" — tracer le flow

### a. Vérifier que le token est bien récupéré côté natif

Sur ton Mac, câble le téléphone (USB, mode debug activé) :

```bash
adb devices                                  # confirme le téléphone
adb logcat -c                                # vide le buffer
adb logcat -v time '*:S' ReactNativeJS:V | grep -i push
```

Ouvre l'app. Tu dois voir (si le prochain build avec logs est installé) :

```
[push] current permission = undetermined
[push] after request = granted
[push] projectId = 4446ab9c-73a6-4668-a04f-85fd733e53fe
[push] got token = ExponentPushToken[xxxxxx…]
```

Si tu vois `permission = denied` → l'utilisateur a refusé (aller dans les réglages Android, autoriser).
Si tu vois `getExpoPushTokenAsync failed` → FCM mal configuré (google-services.json ↔ projectId).
Si tu vois `got token` mais que le backend a 0 token → problème d'injection WebView → dashboard.

### b. Vérifier l'injection dans la WebView

Sur Mac, dans Chrome ouvre `chrome://inspect`. Le téléphone doit apparaître dans "Remote Target" avec la WebView FlexioPage listée. Clique **Inspect**.

Dans la console DevTools de la WebView :
```js
window.__FLEXIO_PUSH_TOKEN__    // → ExponentPushToken[xxx] ou null
window.__FLEXIO_PUSH_STATUS__   // → 'granted' | 'denied' | 'emulator' | 'error'
```

Si `__FLEXIO_PUSH_TOKEN__` est défini mais qu'il n'y a toujours pas de token en base → problème `PushRegistration` composant → vérifier onglet Network qu'un `POST /api/push/register` est bien parti (200 attendu).

### c. Vérifier côté backend

Sur le serveur (ou via un log tail) :

```bash
# Cherche les appels register récents
grep -i "push.*register\|expoPushToken" /var/log/flexiopage-api.log | tail -20

# Vérifie directement en base MongoDB
mongosh "$MONGO_URI" --eval 'db.users.findOne({email:"TON_EMAIL"}, {expoPushTokens:1, pushSoundPreference:1})'
```

## 4. Envoyer un push depuis un script (au cas où)

Depuis `flexiopage-backend/` :

```bash
# S'assurer d'avoir un token connu (récupéré via logs ou DevTools)
TOKEN="ExponentPushToken[xxxxxx]"

curl -sX POST 'https://exp.host/--/api/v2/push/send' \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -d "{
    \"to\": \"$TOKEN\",
    \"title\": \"Test manuel\",
    \"body\": \"Si tu reçois ça, le token est OK.\",
    \"channelId\": \"orders-cash\",
    \"sound\": \"default\"
  }" | jq
```

Réponse attendue :
```json
{ "data": { "status": "ok", "id": "..." } }
```

Si `"status":"error"` avec `"details":{"error":"DeviceNotRegistered"}` → le token est mort (app désinstallée, ou changé). Il faut le supprimer de Mongo et régénérer côté app.

Si `"status":"error"` avec `"details":{"error":"MessageTooBig"}` ou autre → problème payload.

## 5. Cas particuliers

### App fermée : les push arrivent-ils ?
Oui, Expo Push + FCM les livrent même app killée. Si non → **Doze mode / battery optimization** peut bloquer :
- Réglages Android > Apps > FlexioPage > Batterie > "Non restreint"

### Emulateur Android
`getExpoPushToken` retourne toujours `{ token: null, status: 'emulator' }` — normal, FCM ne marche pas sur émulateur sans Google Play Services complets. Toujours tester sur un vrai téléphone.

### Multi-device
Le champ `User.expoPushTokens` est un tableau — chaque téléphone du vendeur reçoit le push. `$addToSet` déduplique automatiquement.

## 6. Nettoyage des tokens morts

Les tokens invalides (app désinstallée) devraient être purgés. Actuellement `push.service.ts` compte les erreurs mais je ne suis pas sûr qu'il purge. À ajouter en phase 3 :

```ts
// Après un envoi qui retourne "DeviceNotRegistered" pour un token :
await User.updateMany({}, { $pull: { expoPushTokens: deadToken } });
```
