import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStoreStore } from '../stores/store-store';
import { colors } from '../theme';

/**
 * Bouton d'en-tête « changer de boutique ». Remet la boutique courante à null,
 * ce qui fait réapparaître l'écran de sélection (cf. RootNavigator).
 */
export function SwitchStoreButton() {
  const setCurrent = useStoreStore((s) => s.setCurrent);
  return (
    <TouchableOpacity style={styles.btn} onPress={() => setCurrent(null)} hitSlop={8}>
      <Ionicons name="swap-horizontal" size={16} color={colors.primary} />
      <Text style={styles.txt}>Changer</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 4 },
  txt: { color: colors.primary, fontWeight: '700', fontSize: 14 },
});
