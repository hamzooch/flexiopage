import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  View,
  Image,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  BackHandler,
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from 'react-native-webview';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { WEB_URL } from './lib/config';
import { colors } from './theme';
import { registerNotificationChannels, getExpoPushToken } from './push';

/** True si l'URL doit rester DANS l'app (tout *.flexiopage.com). */
function isInternal(url: string): boolean {
  const m = url.match(/^https?:\/\/([^/:]+)/i);
  if (!m) return true; // about:, data:, relatif → on laisse la WebView gérer
  return /(^|\.)flexiopage\.com$/i.test(m[1]);
}

export function WebShell() {
  const webRef = useRef<WebView>(null);
  const [firstLoad, setFirstLoad] = useState(true);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Le RefreshControl (pull-to-refresh Android) ne doit être ACTIF que lorsque
  // la WebView est tout en haut. Sinon il intercepte le swipe vers le bas —
  // c'est-à-dire le geste pour REMONTER le contenu — et le scroll vers le haut
  // « bug ». On suit la position de scroll interne de la WebView via onScroll.
  const [atTop, setAtTop] = useState(true);
  const canGoBack = useRef(false);
  // Token push récupéré côté natif ; injecté dans la WebView pour que le site
  // (authentifié) l'enregistre au backend. Gardé en ref pour ré-injecter à
  // chaque (re)chargement de page. Le STATUT est injecté même sans token :
  // c'est lui qui permet au dashboard d'afficher « permission refusée » au
  // lieu d'échouer en silence.
  const pushToken = useRef<string | null>(null);
  const pushStatus = useRef<string | null>(null);

  /** Pousse token + statut dans la page + prévient le site (event). */
  const injectPushToken = useCallback(() => {
    const t = pushToken.current;
    const s = pushStatus.current;
    if (!t && !s) return; // rien encore résolu côté natif
    webRef.current?.injectJavaScript(
      `window.__FLEXIO_PUSH_TOKEN__=${JSON.stringify(t)};` +
        `window.__FLEXIO_PUSH_STATUS__=${JSON.stringify(s)};` +
        `window.dispatchEvent(new Event("flexio-push-token"));true;`,
    );
  }, []);

  // Push : permissions + canaux son + token (une fois), puis écoute des taps.
  useEffect(() => {
    let mounted = true;
    (async () => {
      await registerNotificationChannels();
      const { token, status } = await getExpoPushToken();
      if (mounted) {
        pushToken.current = token;
        pushStatus.current = status;
        injectPushToken(); // au cas où la page est déjà chargée
      }
    })();
    // Tap sur une notification → ouvrir la bonne page dans la WebView.
    const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
      const link = (resp.notification.request.content.data as { link?: string } | undefined)?.link;
      if (link && typeof link === 'string') {
        webRef.current?.injectJavaScript(
          `window.location.href = window.location.origin + ${JSON.stringify(link)};true;`,
        );
      }
    });
    // Retour depuis les réglages système (bannière « Activer » du dashboard) :
    // re-tente le token si la permission vient d'être accordée, et ré-injecte
    // le nouveau statut pour que la bannière disparaisse.
    const appStateSub = AppState.addEventListener('change', async (state) => {
      if (state !== 'active' || pushStatus.current === 'granted') return;
      const { token, status } = await getExpoPushToken();
      if (!mounted) return;
      pushToken.current = token;
      pushStatus.current = status;
      injectPushToken();
    });
    return () => {
      mounted = false;
      sub.remove();
      appStateSub.remove();
    };
  }, [injectPushToken]);

  // Messages postés par le site (window.ReactNativeWebView.postMessage).
  const onWebMessage = useCallback((e: WebViewMessageEvent) => {
    if (e.nativeEvent.data === 'flexio-open-settings') {
      // Bannière « notifications désactivées » → réglages système de l'app.
      Linking.openSettings().catch(() => {});
    }
  }, []);

  const onWebScroll = useCallback((e: { nativeEvent: { contentOffset: { y: number } } }) => {
    const y = e?.nativeEvent?.contentOffset?.y ?? 0;
    const nextTop = y <= 2;
    setAtTop((prev) => (prev === nextTop ? prev : nextTop));
  }, []);

  // Bouton retour Android → revenir dans l'historique de la WebView.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack.current) {
        webRef.current?.goBack();
        return true; // on intercepte
      }
      return false; // sinon comportement par défaut (quitter)
    });
    return () => sub.remove();
  }, []);

  const onNavChange = useCallback((nav: WebViewNavigation) => {
    canGoBack.current = nav.canGoBack;
  }, []);

  // Liens externes (autres domaines, tel:, mailto:, paiement…) → navigateur système.
  const onShouldStart = useCallback((req: { url: string }) => {
    if (isInternal(req.url)) return true;
    Linking.openURL(req.url).catch(() => {});
    return false;
  }, []);

  const reload = useCallback(() => {
    setError(false);
    setFirstLoad(true);
    webRef.current?.reload();
  }, []);

  const onPullRefresh = useCallback(() => {
    setRefreshing(true);
    webRef.current?.reload();
    setTimeout(() => setRefreshing(false), 1200);
  }, []);

  // Écran d'erreur (pas de connexion / serveur injoignable).
  if (error) {
    return (
      <SafeAreaView style={styles.center} edges={['top', 'bottom']}>
        <Image source={require('../assets/icon.png')} style={styles.errorLogo} />
        <Text style={styles.errorTitle}>Connexion impossible</Text>
        <Text style={styles.errorMsg}>
          Vérifie ta connexion internet, puis réessaie.
        </Text>
        <TouchableOpacity style={styles.retryBtn} onPress={reload}>
          <Text style={styles.retryTxt}>Réessayer</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    // `bottom` edge inclus → sur téléphones à gesture bar (iPhones home
    // indicator, Android 10+), le bas de la WebView reste au-dessus de la
    // zone de swipe. Sans ça, sur small screens, les CTA de bas de page
    // (Payer, Confirmer…) tombent sous la barre système et sont durs à taper.
    <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
      {/* Barre de progression en haut pendant le chargement des pages. */}
      {progress < 1 ? (
        <View style={styles.progressTrack}>
          <View style={[styles.progressBar, { width: `${Math.max(progress * 100, 8)}%` }]} />
        </View>
      ) : null}

      <ScrollView
        style={styles.flex}
        // `flexGrow: 1` (au lieu de `flex: 1`) laisse la WebView occuper la
        // hauteur mais N'IMPOSE PAS que le contenu tienne exactement dedans —
        // avec `flex: 1` en contentContainerStyle, RN clampait la hauteur et
        // le scroll interne de la WebView pouvait geler en fin de page.
        contentContainerStyle={styles.grow}
        scrollEnabled={false}
        // Évite le bounce iOS parasite quand ScrollView.scrollEnabled est
        // false — il apparaissait quand un swipe démarrait sur un pixel géré
        // par le RefreshControl puis se propageait à la ScrollView vide.
        bounces={false}
        refreshControl={
          <RefreshControl
            // Android : n'intercepte le geste que quand on est déjà en haut,
            // pour ne pas bloquer le scroll-vers-le-haut au milieu de la page.
            enabled={atTop}
            refreshing={refreshing}
            onRefresh={onPullRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        <WebView
          ref={webRef}
          source={{ uri: WEB_URL }}
          originWhitelist={['https://*', 'http://*']}
          // Session web (cookies httpOnly + localStorage) persistée comme un navigateur.
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          domStorageEnabled
          javaScriptEnabled
          // Upload d'images (création produit) + médias inline.
          allowFileAccess
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          // UA marqué pour que le web puisse détecter l'app si besoin.
          applicationNameForUserAgent="FlexioPageApp"
          pullToRefreshEnabled={Platform.OS === 'ios'}
          // Android : autorise le scroll interne de la WebView même quand
          // elle est enfant d'un ScrollView (le nôtre pour le RefreshControl).
          // Sans ça, l'événement de scroll partait dans le ScrollView parent
          // qui l'ignorait (scrollEnabled=false) → la page semblait figée
          // sur small screens où le viewport est très étroit.
          nestedScrollEnabled
          // Retire le "glow" bleu Android en fin de scroll — visuel étranger
          // à l'UI web + confondait certains users pensant que ça bloquait.
          overScrollMode="never"
          // Suit la position de scroll interne → pilote l'activation du
          // RefreshControl (voir onWebScroll / atTop).
          onScroll={onWebScroll}
          onMessage={onWebMessage}
          onNavigationStateChange={onNavChange}
          onShouldStartLoadWithRequest={onShouldStart}
          onLoadProgress={({ nativeEvent }) => setProgress(nativeEvent.progress)}
          onLoadEnd={() => {
            setFirstLoad(false);
            setProgress(1);
            // Nouvelle page = position en haut → réactive le pull-to-refresh
            // même si aucun onScroll n'a encore été émis (page courte).
            setAtTop(true);
            // Le site (authentifié) a besoin du token push à chaque navigation.
            injectPushToken();
          }}
          onError={() => setError(true)}
          onHttpError={({ nativeEvent }) => {
            // 5xx serveur → écran d'erreur ; 4xx (ex. 401 vers /login) géré par le web.
            if (nativeEvent.statusCode >= 500) setError(true);
          }}
          startInLoadingState={false}
        />
      </ScrollView>

      {/* Splash de marque pendant le tout premier chargement. */}
      {firstLoad ? (
        <View style={styles.overlay}>
          <Image source={require('../assets/logo.png')} style={styles.overlayLogo} resizeMode="contain" />
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 20 }} />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  // contentContainerStyle du ScrollView — `flexGrow` (pas `flex`) pour que
  // la WebView remplisse la hauteur sans clamper le scroll interne.
  grow: { flexGrow: 1 },
  progressTrack: { height: 3, backgroundColor: colors.border },
  progressBar: { height: 3, backgroundColor: colors.primary },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayLogo: { width: 230, height: 72 },
  center: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  errorLogo: { width: 72, height: 72, borderRadius: 16, marginBottom: 20 },
  errorTitle: { fontSize: 20, fontWeight: '800', color: colors.text },
  errorMsg: { fontSize: 15, color: colors.muted, textAlign: 'center', marginTop: 8 },
  retryBtn: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 40,
    marginTop: 24,
  },
  retryTxt: { color: colors.primaryText, fontSize: 16, fontWeight: '700' },
});
