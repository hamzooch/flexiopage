# Data Safety — Play Console

À remplir dans Play Console → App content → Data safety.

L'app est un conteneur WebView autour de https://flexiopage.com/dashboard.
Toute donnée est collectée par le site web et transmise aux mêmes serveurs (api.flexiopage.com).

## URL politique de confidentialité
https://flexiopage.com/privacy-policy

## Données collectées

| Type | Collectée ? | Partagée ? | Optionnelle ? | Motif | Chiffrement transit |
|------|-------------|-----------|---------------|-------|---------------------|
| Nom + email | Oui | Non | Non | Compte utilisateur | Oui (HTTPS) |
| Numéro de téléphone | Oui | Non | Oui | Contact commande / WhatsApp | Oui |
| Adresse postale | Oui | Non | Oui | Livraison commande | Oui |
| Historique achats | Oui | Non | Non | Gestion commandes | Oui |
| Photos / images | Oui | Non | Oui | Upload catalogue produit | Oui |
| Infos paiement | Non collectées directement — traitées par CinetPay / Stripe / Wave | — | — | — | — |
| ID appareil (push token FCM) | Oui | Non | Oui | Notifications ventes | Oui |
| Diagnostics / crashs | Non | — | — | — | — |
| Localisation approximative | Non | — | — | — | — |
| Contacts, calendrier, micro, SMS | Non | — | — | — | — |

## Suppression des données
Un utilisateur peut supprimer son compte depuis :
https://flexiopage.com/data-deletion

## Sécurité
- Toutes les données transitent en HTTPS (TLS 1.2+)
- Mots de passe hashés (bcrypt)
- L'utilisateur peut demander la suppression du compte à tout moment

## Permissions Android déclarées
| Permission | Motif |
|-----------|-------|
| CAMERA | Upload photos produit via `<input type="file" accept="image/*" capture>` dans le dashboard web |
| POST_NOTIFICATIONS (auto Expo) | Notifications push commandes (via expo-notifications + FCM) |
| INTERNET (auto) | WebView vers api.flexiopage.com |

## Public cible
- Adulte (18+) : usage commercial. Sélectionner "Personne ne sera visée en priorité" ou "13+" selon le questionnaire de Play Console.

## Content Rating (IARC)
Répondre au questionnaire IARC dans Play Console :
- Violence : Non
- Sexualité : Non
- Langage grossier : Non
- Substances contrôlées : Non
- Contenu généré par utilisateurs : **Oui** (les vendeurs postent leurs produits) — modération manuelle backend
- Achats intégrés / paiements : **Oui** (transactions e-commerce hors app, redirigées vers passerelles)
Résultat attendu : **PEGI 3 / ESRB Everyone**.
