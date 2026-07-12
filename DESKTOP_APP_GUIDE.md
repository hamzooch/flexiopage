# Guide - Application Desktop Flexiopage

## 🚀 Démarrer l'Application Desktop

### Prérequis
- Node.js 16+ installé
- Backend Flexiopage en cours d'exécution (`npm run dev` dans `flexiopage-backend`)
- Port 3002 disponible (frontend)
- Port 3001 disponible (backend)

### Installation & Démarrage (Mode Développement)

```bash
# 1. Aller dans le dossier desktop
cd flexiopage-desktop

# 2. Installer les dépendances
npm install

# 3. Lancer l'application
npm run dev
```

Cela va:
1. Lancer le serveur Next.js frontend sur http://localhost:3002
2. Lancer l'application Electron avec l'interface Flexiopage

### Usage - Notifications Desktop

Une fois l'app lancée:

#### Quand l'app est au premier plan
- Les notifications s'affichent comme des toasts/messages dans l'app

#### Quand l'app est minimisée dans la barre des tâches
- Vous recevrez des **notifications système** (notifications de bureau)
- Cliquez sur la notification pour ouvrir l'app immédiatement
- Les icônes du tray (barre des tâches) montrent l'activité

## 📋 Fonctionnalités

### Notifications Supportées
- 🛒 **Commandes**: Nouvelle commande, mise à jour statut, livraison
- 💬 **Messages**: Messages clients, support
- 💳 **Paiements**: Nouveau paiement, remboursement
- ⚠️ **Alertes**: Alertes système, avertissements
- 📢 **Système**: Messages généraux

### Raccourcis Clavier
- `Cmd+Q` ou `Ctrl+Q`: Quitter l'app
- `Cmd+R` ou `Ctrl+R`: Recharger la page
- `Cmd+Shift+I` ou `Ctrl+Shift+I`: Ouvrir les outils de développement

### Tray (Barre des tâches)

**Windows/Linux**: Double-cliquez sur l'icône Flexiopage
- Affiche le menu contextuel avec "Show" et "Quit"
- Double-clic pour restaurer l'app

**macOS**: Cliquez sur l'icône Flexiopage en haut à droite
- Même fonctionnalité

## 🔧 Configuration

### Backend URL
Par défaut: `http://localhost:3001`

Pour modifier, éditez `flexiopage-desktop/src/main/services/NotificationService.ts`:

```typescript
private backendUrl: string = 'http://localhost:3001';
```

### Fréquence de Polling des Notifications
Par défaut: 10 secondes

Pour modifier, éditez `flexiopage-desktop/src/main/services/NotificationService.ts`:

```typescript
private pollInterval: number = 10000; // en millisecondes
```

## 📦 Build & Distribution

### Créer un installeur

```bash
cd flexiopage-desktop

# Build l'app
npm run build

# Créer les distributables
npm run dist
```

Les fichiers seront générés dans le dossier `dist/`:
- **Windows**: `Flexiopage-Setup-x.x.x.exe`
- **macOS**: `Flexiopage-x.x.x.dmg`
- **Linux**: `Flexiopage-x.x.x.AppImage`

### Créer un paquet portable (sans installer)

```bash
npm run pack
```

## 🐛 Dépannage

### L'app ne démarre pas

```bash
# 1. Vérifier que le backend tourne
lsof -i :3001

# 2. Vérifier que le frontend peut démarrer
cd ../flexiopage-frontend && npm run dev

# 3. Vérifier les dépendances
cd ../flexiopage-desktop
npm install --force
npm run dev
```

### Les notifications ne s'affichent pas

1. **Vérifier le endpoint backend**:
   ```bash
   curl http://localhost:3001/api/notifications/recent
   # Devrait retourner un JSON array
   ```

2. **Vérifier les logs**:
   ```bash
   # macOS/Linux
   tail -f ~/.config/Flexiopage/logs/main.log
   
   # Windows
   type %APPDATA%\Flexiopage\logs\main.log
   ```

3. **Vérifier l'authentification**:
   - Assurez-vous que vous êtes connecté dans l'app
   - Les notifications ne s'affichent que pour l'utilisateur connecté

### L'app consomme trop de ressources

Réduisez la fréquence de polling dans `NotificationService.ts`:

```typescript
private pollInterval: number = 30000; // 30 secondes au lieu de 10
```

### Erreur "EADDRINUSE: address already in use"

Un autre processus utilise le port 3002 ou 3001:

```bash
# Trouver et tuer le processus
# macOS/Linux
lsof -i :3002
kill -9 <PID>

# Windows
netstat -ano | findstr :3002
taskkill /PID <PID> /F
```

## 📊 Logs & Debugging

### Localisation des logs

- **macOS**: `~/Library/Logs/Flexiopage/main.log`
- **Linux**: `~/.config/Flexiopage/logs/main.log`
- **Windows**: `%APPDATA%\Flexiopage\logs\main.log`

### Activer le mode debug

Dans `flexiopage-desktop/src/main/main.ts`, modifiez:

```typescript
if (isDev) {
  mainWindow.webContents.openDevTools();
}
```

## 🔐 Sécurité

L'app utilise:
- **Context Isolation**: Communication IPC sécurisée
- **Preload Script**: API exposée de manière contrôlée
- **No Node Integration**: Pas d'accès direct au système depuis le rendu
- **Sandbox Mode**: Isolation de processus

## 📱 Support Multi-plateforme

### Windows
- Support complet
- Notifications système Windows 10+
- Installeur NSIS

### macOS
- Support complet
- Notifications système macOS
- DMG distributable
- Code signing possible

### Linux
- Support complet
- Notifications système via libnotify
- AppImage distributable

## 🆘 Support

Pour les problèmes:
1. Vérifiez les logs
2. Vérifiez que le backend est accessible
3. Vérifiez l'authentification
4. Consultez le fichier README.md du dossier flexiopage-desktop

## 📈 Prochaines étapes

- [x] Notifications de base
- [ ] Notifications temps réel (WebSocket)
- [ ] Notifications persistantes
- [ ] Prise d'écran/screen capture intégrée
- [ ] Mise à jour automatique
- [ ] Intégration système d'exploitation avancée
