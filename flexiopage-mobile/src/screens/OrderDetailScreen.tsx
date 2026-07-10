import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ordersApi, extractApiError } from '../lib/api';
import { useStoreStore } from '../stores/store-store';
import type { OrdersStackParamList } from '../navigation/types';
import type { Order, FulfillmentStatus, PaymentStatus } from '../types';
import { Badge } from '../components/Badge';
import { colors, formatMoney } from '../theme';

type Props = NativeStackScreenProps<OrdersStackParamList, 'OrderDetail'>;

const PAYMENT_ACTIONS: { label: string; value: PaymentStatus }[] = [
  { label: 'Marquer payé', value: 'paid' },
  { label: 'En attente', value: 'pending' },
  { label: 'Remboursé', value: 'refunded' },
];

const FULFILLMENT_ACTIONS: { label: string; value: FulfillmentStatus }[] = [
  { label: 'Expédiée', value: 'fulfilled' },
  { label: 'Non expédiée', value: 'unfulfilled' },
  { label: 'Annulée', value: 'cancelled' },
];

export function OrderDetailScreen({ route, navigation }: Props) {
  const store = useStoreStore((s) => s.current);
  const { orderId, orderNumber } = route.params;
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: `#${orderNumber}` });
  }, [navigation, orderNumber]);

  const load = useCallback(async () => {
    if (!store) return;
    try {
      const { data } = await ordersApi.get(store._id, orderId);
      setOrder(data.order);
    } catch (err) {
      setError(extractApiError(err, 'Impossible de charger la commande.'));
    } finally {
      setLoading(false);
    }
  }, [store, orderId]);

  useEffect(() => {
    load();
  }, [load]);

  async function updateStatus(
    patch: { paymentStatus?: PaymentStatus; fulfillmentStatus?: FulfillmentStatus },
  ) {
    if (!store) return;
    setSaving(true);
    try {
      const { data } = await ordersApi.setManualStatus(store._id, orderId, patch);
      setOrder(data.order);
    } catch (err) {
      Alert.alert('Erreur', extractApiError(err, 'Mise à jour impossible.'));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!order) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>{error ?? 'Commande introuvable.'}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
      {/* Statuts actuels */}
      <View style={styles.section}>
        <View style={styles.badges}>
          <Badge label={order.paymentStatus} status={order.paymentStatus} />
          <Badge label={order.fulfillmentStatus} status={order.fulfillmentStatus} />
          {order.confirmationStatus ? (
            <Badge label={order.confirmationStatus} status={order.confirmationStatus} />
          ) : null}
        </View>
      </View>

      {/* Client */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Client</Text>
        <Text style={styles.line}>{order.customerName || '—'}</Text>
        <Text style={styles.muted}>{order.email}</Text>
        {order.customerPhone ? <Text style={styles.muted}>{order.customerPhone}</Text> : null}
        {order.shippingAddress?.city ? (
          <Text style={styles.muted}>
            {order.shippingAddress.line1}
            {order.shippingAddress.line1 ? ', ' : ''}
            {order.shippingAddress.city} · {order.shippingAddress.country}
          </Text>
        ) : null}
      </View>

      {/* Articles */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Articles</Text>
        {order.items.map((it, idx) => (
          <View key={`${it.productId}-${idx}`} style={styles.itemRow}>
            <Text style={styles.itemName} numberOfLines={2}>
              {it.quantity}× {it.name}
            </Text>
            <Text style={styles.itemTotal}>{formatMoney(it.total, order.currency)}</Text>
          </View>
        ))}
        <View style={styles.divider} />
        <View style={styles.itemRow}>
          <Text style={styles.muted}>Livraison</Text>
          <Text style={styles.muted}>{formatMoney(order.shippingCost, order.currency)}</Text>
        </View>
        <View style={styles.itemRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{formatMoney(order.total, order.currency)}</Text>
        </View>
      </View>

      {/* Actions paiement */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Paiement</Text>
        <View style={styles.actions}>
          {PAYMENT_ACTIONS.map((a) => (
            <ActionButton
              key={a.value}
              label={a.label}
              active={order.paymentStatus === a.value}
              disabled={saving}
              onPress={() => updateStatus({ paymentStatus: a.value })}
            />
          ))}
        </View>
      </View>

      {/* Actions expédition */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Expédition</Text>
        <View style={styles.actions}>
          {FULFILLMENT_ACTIONS.map((a) => (
            <ActionButton
              key={a.value}
              label={a.label}
              active={order.fulfillmentStatus === a.value}
              disabled={saving}
              onPress={() => updateStatus({ fulfillmentStatus: a.value })}
            />
          ))}
        </View>
      </View>

      {saving ? <ActivityIndicator color={colors.primary} style={{ marginTop: 8 }} /> : null}
    </ScrollView>
  );
}

function ActionButton({
  label,
  active,
  disabled,
  onPress,
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.actionBtn, active && styles.actionBtnActive, disabled && styles.actionDisabled]}
      onPress={onPress}
      disabled={disabled || active}
    >
      <Text style={[styles.actionText, active && styles.actionTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
  content: { padding: 16 },
  section: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: colors.muted, marginBottom: 10, textTransform: 'uppercase' },
  badges: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  line: { fontSize: 16, fontWeight: '600', color: colors.text },
  muted: { fontSize: 14, color: colors.muted, marginTop: 2 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 4, gap: 12 },
  itemName: { flex: 1, fontSize: 14, color: colors.text },
  itemTotal: { fontSize: 14, color: colors.text, fontWeight: '600' },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 8 },
  totalLabel: { fontSize: 16, fontWeight: '700', color: colors.text },
  totalValue: { fontSize: 16, fontWeight: '800', color: colors.primary },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.bg,
  },
  actionBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  actionDisabled: { opacity: 0.5 },
  actionText: { fontSize: 14, fontWeight: '600', color: colors.text },
  actionTextActive: { color: colors.primaryText },
  empty: { color: colors.muted, paddingHorizontal: 24, textAlign: 'center' },
});
