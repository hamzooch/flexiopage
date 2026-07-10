/**
 * Push mobile (Expo). L'app est une coquille WebView : l'AUTH vit dans la
 * WebView (cookies/localStorage), pas dans le natif. On récupère donc ici
 * l'ExpoPushToken côté natif, et c'est le SITE (dans la WebView, authentifié)
 * qui l'enregistre au backend `POST /api/push/register` — cf. injection dans
 * WebShell.
 *
 * Son : Android porte le son via un CANAL. On enregistre 3 canaux (un par son
 * proposé) dont les `channelId` correspondent à ceux du backend (push.service).
 * Le vendeur choisit son son depuis le dashboard ; le backend route le push
 * vers le bon canal.
 *
 * ⚠️ Les fichiers son doivent exister dans `assets/sounds/` et être déclarés au
 * plugin `expo-notifications` dans app.json (sinon build sans son custom).
 */
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// En premier plan, on affiche quand même l'alerte + le son.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Doit rester synchronisé avec PUSH_SOUNDS du backend (channelId + fichier).
 *  Phase de test : un seul son. Ajoute les autres canaux ici quand les fichiers
 *  correspondants sont déposés dans assets/sounds/ + déclarés dans app.json. */
const SOUND_CHANNELS = [
  { id: 'orders-cash', name: 'Commandes — Cha-ching', sound: 'cash_register.wav' },
];

/** Enregistre les 3 canaux Android (chacun avec son son). No-op sur iOS. */
export async function registerNotificationChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  for (const c of SOUND_CHANNELS) {
    await Notifications.setNotificationChannelAsync(c.id, {
      name: c.name,
      importance: Notifications.AndroidImportance.HIGH,
      sound: c.sound,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#4F46E5',
    });
  }
}

/** Demande la permission puis renvoie l'ExpoPushToken (ou null si refusé/émulateur). */
export async function getExpoPushToken(): Promise<string | null> {
  if (!Device.isDevice) return null; // pas de push sur émulateur
  const current = await Notifications.getPermissionsAsync();
  let status = current.status;
  if (status !== 'granted') {
    const asked = await Notifications.requestPermissionsAsync();
    status = asked.status;
  }
  if (status !== 'granted') return null;

  const projectId =
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  try {
    const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    return token.data || null;
  } catch {
    return null;
  }
}
