import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
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
import { WebView, type WebViewNavigation } from 'react-native-webview';
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
  // chaque (re)chargement de page.
  const pushToken = useRef<string | null>(null);

  /** Pousse le token dans la page + prévient le site (event) qu'il est dispo. */
  const injectPushToken = useCallback(() => {
    const t = pushToken.current;
    if (!t) return;
    webRef.current?.injectJavaScript(
      `window.__FLEXIO_PUSH_TOKEN__=${JSON.stringify(t)};` +
        `window.dispatchEvent(new Event("flexio-push-token"));true;`,
    );
  }, []);

  // Push : permissions + canaux son + token (une fois), puis écoute des taps.
  useEffect(() => {
    let mounted = true;
    (async () => {
      await registerNotificationChannels();
      const token = await getExpoPushToken();
      if (mounted && token) {
        pushToken.current = token;
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
    return () => {
      mounted = false;
      sub.remove();
    };
  }, [injectPushToken]);

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
    <SafeAreaView style={styles.flex} edges={['top']}>
      {/* Barre de progression en haut pendant le chargement des pages. */}
      {progress < 1 ? (
        <View style={styles.progressTrack}>
          <View style={[styles.progressBar, { width: `${Math.max(progress * 100, 8)}%` }]} />
        </View>
      ) : null}

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.flex}
        scrollEnabled={false}
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
          // Suit la position de scroll interne → pilote l'activation du
          // RefreshControl (voir onWebScroll / atTop).
          onScroll={onWebScroll}
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
