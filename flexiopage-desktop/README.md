# Flexiopage Desktop App

Application desktop Electron pour Flexiopage avec support des notifications système.

## Fonctionnalités

- 📱 Interface utilisateur complète de Flexiopage
- 🔔 Notifications système même quand l'app est minimisée
- 🎯 Tray icon avec accès rapide
- 🚀 Démarrage automatique du serveur frontend
- 📦 Support multi-plateforme (Windows, macOS, Linux)

## Installation

```bash
npm install
```

## Développement

Pour lancer l'app en mode développement avec hot-reload:

```bash
npm run dev
```

Cela va:
1. Lancer le serveur frontend Next.js sur http://localhost:3002
2. Lancer l'app Electron

## Build

### Pour créer un distributable:

```bash
npm run build
```

### Pour créer un installeur:

```bash
npm run dist
```

## Utilisation des Notifications

### Depuis le Frontend (React)

```typescript
import { useNotifications } from '../hooks/useNotifications';

function MyComponent() {
  const { showNotification } = useNotifications();

  const handleNewOrder = () => {
    showNotification({
      title: 'Nouvelle commande',
      body: 'Vous avez reçu une nouvelle commande #12345',
      type: 'order'
    });
  };

  return <button onClick={handleNewOrder}>Test Notification</button>;
}
```

### Depuis le Backend

Implémentez un endpoint `/api/notifications/recent` qui retourne les notifications:

```typescript
GET /api/notifications/recent?since=1234567890

Response:
[
  {
    type: "order",
    title: "Nouvelle commande",
    body: "Commande #12345 - 10,000 XOF",
    data: { orderId: "12345" }
  }
]
```

## Architecture

```
flexiopage-desktop/
├── src/
│   ├── main/
│   │   ├── main.ts              # Point d'entrée Electron
│   │   ├── preload.ts           # IPC Bridge sécurisé
│   │   └── services/
│   │       ├── NotificationService.ts
│   │       └── AppUpdater.ts
│   ├── hooks/
│   │   └── useNotifications.ts  # Hook React
│   └── preload.d.ts             # Types TypeScript
├── assets/                       # Images et icônes
│   ├── icon.png
│   ├── icon-tray.png
│   └── icons/
│       ├── order.png
│       ├── message.png
│       ├── payment.png
│       └── alert.png
└── package.json
```

## Configuration

### Environnement

Les variables d'environnement peuvent être configurées dans `.env`:

```
REACT_APP_API_URL=http://localhost:3001
REACT_APP_WS_URL=ws://localhost:3001
```

### Backend URL

Par défaut, l'app essaie de se connecter à `http://localhost:3001`.
Modifiez `src/main/services/NotificationService.ts` pour changer cette URL.

## Types de Notifications

- **order**: Nouvelle commande ou mise à jour
- **message**: Message reçu
- **payment**: Notification de paiement
- **alert**: Alerte système
- **system**: Message système général

## Dépannage

### Les notifications ne s'affichent pas

1. Vérifiez que le backend est en cours d'exécution sur le port 3001
2. Vérifiez l'endpoint `/api/notifications/recent` sur le backend
3. Consultez les logs: `~/.config/Flexiopage/logs/`

### L'app Electron ne démarre pas

1. Vérifiez que le serveur frontend démarre correctement
2. Vérifiez les logs dans la console
3. Essayez de régénérer les dépendances: `npm install --force`

## Logs

Les logs de l'application sont disponibles à:

- **Windows**: `%APPDATA%\Flexiopage\logs\`
- **macOS**: `~/Library/Logs/Flexiopage/`
- **Linux**: `~/.config/Flexiopage/logs/`
