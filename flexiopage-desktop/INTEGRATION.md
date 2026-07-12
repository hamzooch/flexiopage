# Guide d'Intégration - Notifications Desktop

## Pour les développeurs Frontend

### 1. Utiliser le hook `useNotifications`

Copiez le fichier `src/hooks/useNotifications.ts` dans votre projet frontend:

```bash
cp flexiopage-desktop/src/hooks/useNotifications.ts flexiopage-frontend/src/hooks/
```

### 2. Utiliser les notifications dans une page ou composant

```typescript
'use client';

import { useEffect } from 'react';
import { useNotifications } from '@/hooks/useNotifications';

export default function OrdersPage() {
  const { showNotification } = useNotifications();

  useEffect(() => {
    // Exemple: afficher une notification quand une nouvelle commande arrive
    const handleNewOrder = (order: any) => {
      showNotification({
        title: 'Nouvelle commande',
        body: `Commande #${order.id} - ${order.total} XOF`,
        type: 'order',
      });
    };

    // Listen to WebSocket or polling events
    // handleNewOrder({ id: '12345', total: 50000 });
  }, [showNotification]);

  return (
    <div>
      {/* Your component */}
    </div>
  );
}
```

### 3. Types de notifications supportés

```typescript
type NotificationType = 'order' | 'message' | 'payment' | 'alert' | 'system';

interface NotificationOptions {
  title: string;          // Titre de la notification
  body: string;           // Message principal
  icon?: string;          // URL vers une icône (optionnel)
  type?: NotificationType; // Type de notification
}
```

## Pour les développeurs Backend

### 1. Créer une notification

```typescript
import { Notification } from '../models/Notification.model';

await Notification.create({
  userId: new ObjectId(userId),
  type: 'order',
  title: 'Nouvelle commande',
  message: 'Vous avez reçu une commande #12345',
  read: false,
  createdAt: new Date(),
});
```

### 2. Endpoint pour le polling (Desktop App)

L'app Desktop utilise l'endpoint suivant pour récupérer les notifications (port 5051):

```
GET http://localhost:5051/api/notifications/recent?since=TIMESTAMP
```

**Paramètres:**
- `since`: Timestamp en millisecondes (optionnel)

**Réponse:**
```json
[
  {
    "type": "order",
    "title": "Nouvelle commande",
    "body": "Commande #12345 - 50000 XOF",
    "data": {
      "id": "507f1f77bcf86cd799439011",
      "read": false,
      "createdAt": "2026-07-12T10:30:00Z"
    }
  }
]
```

### 3. Exemple: Déclencher une notification lors d'une nouvelle commande

```typescript
// Dans orders.controller.ts
import { Notification } from '../models/Notification.model';

export async function createOrder(req: AuthRequest, res: Response) {
  // ... créer la commande ...

  // Créer une notification pour le vendeur
  await Notification.create({
    userId: req.user._id,
    type: 'order',
    title: 'Nouvelle commande reçue',
    message: `Commande #${order._id} de ${order.customerName}`,
    read: false,
    data: {
      orderId: order._id,
    },
  });

  res.json({ order });
}
```

## Workflow de notification

### Desktop App (Polling)
1. App démarre → initialise NotificationService
2. Chaque 10 secondes:
   - Fait un GET sur `/api/notifications/recent?since=LAST_CHECK_TIME`
   - Pour chaque notification reçue: affiche une notification système
   - L'utilisateur peut cliquer sur la notification pour ouvrir l'app

### Frontend Web (Real-time)
1. Utilisateur ouvre l'app web
2. Hook `useNotifications` vérifie si en Electron ou navigateur
3. Lors d'un événement (WebSocket, polling, mutation):
   - Appelle `showNotification()`
   - Si Electron: affiche notification système
   - Si navigateur: affiche notification web

## Variables d'environnement (Backend)

Assurez-vous que le backend expose l'endpoint `/api/notifications/recent`:

```env
# Aucune variable spéciale requise
# L'authentification se fait par JWT token
```

## Dépannage

### Les notifications ne s'affichent pas
1. Vérifiez que `/api/notifications/recent` retourne les bonnes données
2. Vérifiez les logs: `tail -f ~/.config/Flexiopage/logs/main.log`
3. Vérifiez que l'utilisateur a les permissions de lire ses notifications

### Les notifications sont en retard
1. Augmentez la fréquence de polling en modifiant `pollInterval` dans NotificationService.ts
2. Implémentez des WebSockets pour les notifications en temps réel

## Architecture de la notification

```
Backend (Order créée)
    ↓
Notification.create() 
    ↓
Desktop App (Polling toutes les 10s)
    ↓
GET /api/notifications/recent?since=X
    ↓
Notification système affichée
    ↓
Utilisateur clique
    ↓
App ouvre et navigate vers la commande
```
