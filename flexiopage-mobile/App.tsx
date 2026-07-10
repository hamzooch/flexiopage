import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { WebShell } from './src/WebShell';

/**
 * L'app mobile FlexioPage est un conteneur natif autour du dashboard web
 * responsive (WebView). L'affichage est donc identique à l'interface web sur
 * petit écran, et toute mise à jour du site se reflète instantanément dans
 * l'app. L'authentification (cookies + localStorage) est gérée par la WebView
 * exactement comme dans un navigateur mobile.
 */
export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <WebShell />
    </SafeAreaProvider>
  );
}
