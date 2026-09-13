# Screenshots Play Store

## Requis
- **Phone** : min 2, max 8 — ratio 9:16 (portrait) ou 16:9 (paysage). Résolution min : 320 px côté court, max : 3840 px côté long. Format PNG/JPG 24-bit.
- **7" Tablet** : recommandé (min 1)
- **10" Tablet** : recommandé (min 1)

## Résolutions recommandées
- Phone portrait : **1080×1920** (ratio 9:16) ou **1080×2340** (19.5:9 moderne)
- Tablet 7" : 1200×1920
- Tablet 10" : 1600×2560

## Écrans à capturer (ordre de vente)
1. **Landing dashboard** — vue d'ensemble, revenus, commandes du jour
2. **Création produit** — simplicité de l'ajout
3. **Studio IA** — génération visuel/vidéo (différenciateur fort)
4. **Vitrine boutique** — ce que voit le client sur son téléphone
5. **Gestion commande** — chat WhatsApp intégré, statut
6. **Analytics** — courbes de revenus, top produits
7. **Notifications** — cash register sonne à chaque vente
8. **Multi-canal** — WhatsApp, TikTok, Facebook, Instagram

## Comment capturer
Depuis un émulateur Android ou un vrai téléphone :
1. Installer la version preview APK (`eas build --profile preview`)
2. Se logger avec un compte démo bien fourni (produits + commandes fictives)
3. Naviguer vers chaque écran
4. Screenshot natif (Vol- + Power) ou `adb exec-out screencap -p > shot.png`

## Encadrement (optionnel mais recommandé)
Utiliser `frame_screenshots.py` (dans `../../../play-store/`) ou :
- https://www.appstorescreenshot.com/
- https://previewed.app/
- https://screenshots.pro/

Ajouter un titre court par capture ("Créez votre boutique", "Vendez sur WhatsApp"…).

## Ranger ici
- `phone/01-dashboard.png`
- `phone/02-create-product.png`
- etc.
