# Checklist publication Play Store — FlexioPage Android

Ordre d'exécution recommandé. Coche au fur et à mesure.

## 1. Comptes et outils
- [ ] Compte Google Play Console actif ($25 payé)
- [ ] `eas-cli` à jour : `npm i -g eas-cli` (ou `npx eas-cli`)
- [ ] Login EAS : `npx eas login` (compte `hamzooch`)
- [ ] Vérifier lien projet : `npx eas project:info` dans `flexiopage-mobile/`

## 2. Créer l'app dans Play Console
- [ ] https://play.google.com/console → **Create app**
- [ ] Nom : `FlexioPage – Boutique en ligne`
- [ ] Langue par défaut : Français (France)
- [ ] Type : **App** / Gratuite
- [ ] Package name : `com.flexiopage.mobile`
- [ ] Accepter les déclarations Play

## 3. Remplir "App content"
- [ ] Privacy policy URL : `https://flexiopage.com/privacy-policy`
- [ ] Ads : **No** (aucune pub dans l'app)
- [ ] App access : fournir compte test (email + mot de passe) si contenu derrière login
- [ ] Content rating : questionnaire IARC (cf `data-safety.md`)
- [ ] Target audience : 18+
- [ ] News app : Non
- [ ] COVID-19 contact tracing : Non
- [ ] Data safety : remplir depuis `data-safety.md`
- [ ] Government app : Non
- [ ] Financial features : Oui — "Handles user's payments" (paiements e-commerce)
- [ ] Health : Non

## 4. Store listing (Main store listing)
- [ ] App name (FR) : depuis `descriptions/fr.md`
- [ ] Short + full description FR
- [ ] Ajouter locale EN : `descriptions/en.md`
- [ ] App icon 512×512 : `../../play-store/icon-512.png` ✅ existe
- [ ] Feature graphic 1024×500 : `../../play-store/feature-graphic-1024x500.png` ✅ existe
- [ ] Phone screenshots (min 2, max 8, 16:9 ou 9:16, min 320px) → **à faire**
- [ ] 7" tablet screenshots (recommandé, 1-8)
- [ ] 10" tablet screenshots (recommandé, 1-8)
- [ ] Vidéo YouTube (optionnel)
- [ ] Catégorie : Shopping
- [ ] Tags : Online Store, E-commerce
- [ ] Email contact : teyeb.hamza12@gmail.com
- [ ] Site web : https://flexiopage.com

## 5. Créer service account pour submit auto
- [ ] Google Cloud Console → nouveau projet ou existant
- [ ] IAM → Service Accounts → Create → rôle "Service Account User"
- [ ] Créer clé JSON, télécharger, mettre dans `flexiopage-mobile/secrets/play-service-account.json`
- [ ] Play Console → Users & permissions → Invite → email du SA
- [ ] Permissions : Release manager + Admin sur l'app
- [ ] Attendre 24-48h la propagation
- [ ] Alternative rapide : premier upload manuel via UI Play Console

## 6. Build production Android
Depuis `flexiopage-mobile/` :
```
npx eas build --platform android --profile production
```
- Attente ~15-25 min
- Sortie : AAB signé (keystore géré par EAS)
- Récupérer le lien de download AAB dans la sortie

## 7. Premier upload
### Option A — Manuel (recommandé pour la 1ʳᵉ fois)
- [ ] Play Console → Testing → **Internal testing** → Create release
- [ ] Uploader l'AAB
- [ ] Release name : `0.1.1 (1)`
- [ ] Release notes : depuis `changelogs/whatsnew-fr.txt`
- [ ] Save → Review release → Start rollout to Internal testing
- [ ] Ajouter testeurs internes (jusqu'à 100 emails)
- [ ] Récupérer le lien opt-in, installer sur ton téléphone, tester

### Option B — Auto via EAS Submit
```
npx eas submit --platform android --profile production --latest
```

## 8. Promouvoir vers production
- [ ] Après tests internes OK → Promote to Closed testing (bêta fermée)
- [ ] Puis Open testing (bêta publique) ou directement Production
- [ ] Play Console → Production → Countries → sélectionner pays cibles
- [ ] Review Google : 1-7 jours pour la 1ʳᵉ publication

## 9. Post-publication
- [ ] Configurer Play Console → Settings → Alerts (crashes, ANRs)
- [ ] Répondre aux avis utilisateurs
- [ ] Suivi Vitals (crash rate < 1%, ANR < 0.47%)

---

## Commandes utiles
```bash
# Info projet EAS
npx eas project:info

# Voir les builds
npx eas build:list

# Voir le dernier build
npx eas build:view --latest

# Version courante remote
npx eas build:version:get --platform android

# Preview APK à installer sur device
npx eas build --platform android --profile preview
```
