import React, { useCallback, useLayoutEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ordersApi, extractApiError, type OrderStatusFilter } from '../lib/api';
import { useStoreStore } from '../stores/store-store';
import type { OrdersStackParamList } from '../navigation/types';
import type { Order } from '../types';
import { Badge } from '../components/Badge';
import { SwitchStoreButton } from '../components/SwitchStoreButton';
import { colors, formatMoney } from '../theme';

type Props = NativeStackScreenProps<OrdersStackParamList, 'Orders'>;

const FILTERS: { label: string; value: OrderStatusFilter }[] = [
  { label: 'Toutes', value: 'all' },
  { label: 'En attente', value: 'pending' },
  { label: 'Payées', value: 'paid' },
  { label: 'Livrées', value: 'delivered' },
  { label: 'Annulées', value: 'cancelled' },
];

export function OrdersScreen({ navigation }: Props) {
  const store = useStoreStore((s) => s.current);
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<OrderStatusFilter>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({ headerRight: () => <SwitchStoreButton /> });
  }, [navigation]);

  const load = useCallback(
    async (status: OrderStatusFilter, isRefresh = false) => {
      if (!store) return;
      setError(null);
      if (isRefresh) setRefreshing(true);
      try {
        const { data } = await ordersApi.list(store._id, {
          limit: 50,
          status: status === 'all' ? undefined : status,
        });
        setOrders(data.orders ?? []);
      } catch (err) {
        setError(extractApiError(err, 'Impossible de charger les commandes.'));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [store],
  );

  useFocusEffect(
    useCallback(() => {
      load(filter);
    }, [load, filter]),
  );

  function selectFilter(value: OrderStatusFilter) {
    setFilter(value);
    setLoading(true);
    load(value);
  }

  return (
    <View style={styles.flex}>
      {/* Filtres par statut */}
      <View style={styles.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {FILTERS.map((f) => (
            <TouchableOpacity
              key={f.value}
              style={[styles.chip, filter === f.value && styles.chipActive]}
              onPress={() => selectFilter(f.value)}
            >
              <Text style={[styles.chipTxt, filter === f.value && styles.chipTxtActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => o._id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load(filter, true)} />
          }
          ListEmptyComponent={
            <Text style={styles.empty}>{error ?? 'Aucune commande dans ce filtre.'}</Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() =>
                navigation.navigate('OrderDetail', {
                  orderId: item._id,
                  orderNumber: item.orderNumber,
                })
              }
            >
              <View style={styles.cardTop}>
                <Text style={styles.orderNumber}>#{item.orderNumber}</Text>
                <Text style={styles.amount}>{formatMoney(item.total, item.currency)}</Text>
              </View>
              <Text style={styles.customer}>
                {item.customerName || item.email || 'Client inconnu'}
              </Text>
              <View style={styles.badges}>
                <Badge label={item.paymentStatus} status={item.paymentStatus} />
                <Badge label={item.fulfillmentStatus} status={item.fulfillmentStatus} />
                {item.confirmationStatus ? (
                  <Badge label={item.confirmationStatus} status={item.confirmationStatus} />
                ) : null}
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60 },
  filterBar: { backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
  filterRow: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipTxt: { fontSize: 13, fontWeight: '600', color: colors.text },
  chipTxtActive: { color: colors.primaryText },
  list: { padding: 16 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderNumber: { fontSize: 16, fontWeight: '700', color: colors.text },
  amount: { fontSize: 16, fontWeight: '700', color: colors.primary },
  customer: { fontSize: 14, color: colors.muted, marginTop: 4, marginBottom: 10 },
  badges: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  empty: { textAlign: 'center', color: colors.muted, marginTop: 60, paddingHorizontal: 24 },
});
