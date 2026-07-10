import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { usersApi, extractApiError } from '../lib/api';
import { useStoreStore } from '../stores/store-store';
import { useAuthStore } from '../stores/auth-store';
import type { Store } from '../types';
import { colors } from '../theme';

export function SelectStoreScreen() {
  const setCurrent = useStoreStore((s) => s.setCurrent);
  const signOut = useAuthStore((s) => s.signOut);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data } = await usersApi.getStores();
      setStores(data.stores ?? []);
    } catch (err) {
      setError(extractApiError(err, 'Impossible de charger tes boutiques.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function pick(store: Store) {
    // Sélectionner une boutique fait basculer le RootNavigator vers les onglets
    // (rendu conditionnel sur `current`).
    setCurrent(store);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <FlatList
        data={stores}
        keyExtractor={(s) => s._id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
        ListHeaderComponent={
          <Text style={styles.heading}>Choisis une boutique</Text>
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            {error ?? 'Aucune boutique. Crée-en une depuis le dashboard web.'}
          </Text>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => pick(item)}>
            <Text style={styles.storeName}>{item.name}</Text>
            <Text style={styles.storeSlug}>/{item.slug}</Text>
          </TouchableOpacity>
        )}
      />
      <TouchableOpacity style={styles.logout} onPress={signOut}>
        <Text style={styles.logoutText}>Se déconnecter</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
  list: { padding: 16 },
  heading: { fontSize: 22, fontWeight: '800', color: colors.text, marginBottom: 16 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    marginBottom: 12,
  },
  storeName: { fontSize: 17, fontWeight: '700', color: colors.text },
  storeSlug: { fontSize: 13, color: colors.muted, marginTop: 2 },
  empty: { textAlign: 'center', color: colors.muted, marginTop: 40, paddingHorizontal: 24 },
  logout: { padding: 18, alignItems: 'center' },
  logoutText: { color: colors.danger, fontWeight: '600' },
});
