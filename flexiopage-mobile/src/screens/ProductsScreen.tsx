import React, { useCallback, useLayoutEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  Image,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { productsApi, extractApiError } from '../lib/api';
import { useStoreStore } from '../stores/store-store';
import type { ProductsStackParamList } from '../navigation/types';
import type { Product } from '../types';
import { SwitchStoreButton } from '../components/SwitchStoreButton';
import { Badge } from '../components/Badge';
import { colors, formatMoney } from '../theme';

type Props = NativeStackScreenProps<ProductsStackParamList, 'Products'>;

export function ProductsScreen({ navigation }: Props) {
  const store = useStoreStore((s) => s.current);
  const [items, setItems] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({ headerRight: () => <SwitchStoreButton /> });
  }, [navigation]);

  const load = useCallback(
    async (q = '', isRefresh = false) => {
      if (!store) return;
      setError(null);
      if (isRefresh) setRefreshing(true);
      try {
        const { data } = await productsApi.list(store._id, { limit: 100, search: q || undefined });
        setItems(data.products ?? []);
      } catch (err) {
        setError(extractApiError(err, 'Impossible de charger les produits.'));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [store],
  );

  useFocusEffect(
    useCallback(() => {
      load(search);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load]),
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <View style={styles.searchRow}>
        <Ionicons name="search" size={18} color={colors.muted} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Rechercher un produit"
          placeholderTextColor={colors.muted}
          returnKeyType="search"
          onSubmitEditing={() => load(search)}
          autoCapitalize="none"
        />
        {search ? (
          <TouchableOpacity
            onPress={() => {
              setSearch('');
              load('');
            }}
          >
            <Ionicons name="close-circle" size={18} color={colors.muted} />
          </TouchableOpacity>
        ) : null}
      </View>

      <FlatList
        data={items}
        keyExtractor={(p) => p._id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(search, true)} />
        }
        ListEmptyComponent={
          <Text style={styles.empty}>{error ?? 'Aucun produit. Touche + pour en créer un.'}</Text>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate('ProductDetail', { productId: item._id })}
          >
            {item.images?.[0] ? (
              <Image source={{ uri: item.images[0] }} style={styles.thumb} />
            ) : (
              <View style={[styles.thumb, styles.thumbPlaceholder]}>
                <Ionicons name="image-outline" size={22} color={colors.muted} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={2}>
                {item.name}
              </Text>
              <Text style={styles.meta}>
                {formatMoney(item.price, store?.currency || 'USD')}
                {item.type === 'physical' ? ` · stock ${item.stock}` : ' · digital'}
              </Text>
            </View>
            <Badge
              label={item.isPublished ? 'publié' : 'brouillon'}
              status={item.isPublished ? 'paid' : 'pending'}
            />
          </TouchableOpacity>
        )}
      />

      {/* Bouton flottant « nouveau produit » */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('ProductCreate')}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={28} color={colors.primaryText} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 16, color: colors.text, paddingVertical: 2 },
  list: { padding: 16, paddingBottom: 100 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 10,
  },
  thumb: { width: 52, height: 52, borderRadius: 10, backgroundColor: colors.bg },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 15, fontWeight: '600', color: colors.text },
  meta: { fontSize: 13, color: colors.muted, marginTop: 3 },
  empty: { textAlign: 'center', color: colors.muted, marginTop: 60, paddingHorizontal: 24 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
});
