# Sons de notification (push)

Dépose ici **3 fichiers son** — c'est le vendeur qui choisira lequel dans le dashboard :

| Fichier | Son (libellé vendeur) |
|---|---|
| `chime.wav` | Carillon |
| `bell.wav`  | Cloche |
| `ding.wav`  | Ding |

## Contraintes
- Format **`.wav`** (recommandé), court : **≤ 5 secondes** (Android tronque au-delà ; iOS ≤ 30 s).
- Noms EXACTS ci-dessus — ils sont référencés dans `app.json` (plugin `expo-notifications`)
  et mappés côté backend (`push.service.ts` → `PUSH_SOUNDS`) et natif (`src/push.ts` → canaux Android).
- Après ajout : `npx expo prebuild` puis un nouveau build EAS (le son custom n'est embarqué qu'au build).

⚠️ Tant que ces 3 fichiers sont absents, le build échoue (le plugin référence des fichiers manquants).
Tu peux prendre des sons libres de droits (ex. notificationsounds.com, mixkit.co) et les renommer.
