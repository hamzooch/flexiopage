import React, { useCallback, useLayoutEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { analyticsApi, ordersApi, extractApiError } from '../lib/api';
import { useStoreStore } from '../stores/store-store';
import { useAuthStore } from '../stores/auth-store';
import type { DashboardStackParamList } from '../navigation/types';
import type { AnalyticsSummary, Order } from '../types';
import { KpiCard } from '../components/KpiCard';
import { SwitchStoreButton } from '../components/SwitchStoreButton';
import { Badge } from '../components/Badge';
import { colors, formatMoney } from '../theme';

type Props = NativeStackScreenProps<DashboardStackParamList, 'Dashboard'>;

export function DashboardScreen({ navigation }: Props) {
  const store = useStoreStore((s) => s.current);
  const user = useAuthStore((s) => s.user);
  const [stats, setStats] = useState<AnalyticsSummary | null>(null);
  const [recent, setRecent] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: store?.name ?? 'Accueil',
      headerRight: () => <SwitchStoreButton />,
    });
  }, [navigation, store?.name]);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!store) return;
      setError(null);
      if (isRefresh) setRefreshing(true);
      try {
        const [a, o] = await Promise.all([
          analyticsApi.get(store._id),
          ordersApi.list(store._id, { limit: 5 }),
        ]);
        setStats(a.data);
        setRecent(o.data.orders ?? []);
      } catch (err) {
        setError(extractApiError(err, 'Impossible de charger le tableau de bord.'));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [store],
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const cur = stats?.currency || store?.currency || 'USD';

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
    >
      <Text style={styles.greeting}>Bonjour {user?.name?.split(' ')[0] || ''} 👋</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {/* KPIs */}
      <View style={styles.grid}>
        <KpiCard
          label="Revenu (payé)"
          value={formatMoney(stats?.totalRevenue ?? 0, cur)}
          icon="cash-outline"
          tint={colors.success}
        />
        <KpiCard
          label="Commandes"
          value={String(stats?.totalOrders ?? 0)}
          icon="bag-handle-outline"
          tint={colors.primary}
        />
        <KpiCard
          label="Revenu ce mois"
          value={formatMoney(stats?.revenueThisMonth ?? 0, cur)}
          icon="trending-up-outline"
          tint="#0ea5e9"
        />
        <KpiCard
          label="Commandes ce mois"
          value={String(stats?.ordersThisMonth ?? 0)}
          icon="calendar-outline"
          tint="#8b5cf6"
        />
        <KpiCard
          label="Vues boutique"
          value={String(stats?.pageViews ?? 0)}
          icon="eye-outline"
          tint="#d97706"
        />
        <KpiCard
          label="Conversion"
          value={stats?.conversionRate != null ? `${stats.conversionRate.toFixed(1)}%` : '—'}
          icon="stats-chart-outline"
          tint="#ec4899"
        />
      </View>

      {/* Commandes récentes */}
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Commandes récentes</Text>
        <TouchableOpacity onPress={() => navigation.getParent()?.navigate('Commandes')}>
          <Text style={styles.link}>Tout voir</Text>
        </TouchableOpacity>
      </View>

      {recent.length === 0 ? (
        <Text style={styles.empty}>Aucune commande pour le moment.</Text>
      ) : (
        recent.map((o) => (
          <TouchableOpacity
            key={o._id}
            style={styles.orderCard}
            onPress={() =>
              navigation
                .getParent()
                ?.navigate('Commandes', {
                  screen: 'OrderDetail',
                  params: { orderId: o._id, orderNumber: o.orderNumber },
                })
            }
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.orderNum}>#{o.orderNumber}</Text>
              <Text style={styles.orderCustomer} numberOfLines={1}>
                {o.customerName || o.email}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <Text style={styles.orderAmount}>{formatMoney(o.total, o.currency)}</Text>
              <Badge label={o.paymentStatus} status={o.paymentStatus} />
            </View>
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 32 },
  greeting: { fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 28,
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
  link: { color: colors.primary, fontWeight: '700' },
  orderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 10,
    gap: 12,
  },
  orderNum: { fontSize: 15, fontWeight: '700', color: colors.text },
  orderCustomer: { fontSize: 13, color: colors.muted, marginTop: 2 },
  orderAmount: { fontSize: 15, fontWeight: '700', color: colors.primary },
  empty: { color: colors.muted, textAlign: 'center', marginTop: 12 },
  error: {
    color: colors.danger,
    backgroundColor: '#fee2e2',
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
    fontSize: 14,
  },
});
