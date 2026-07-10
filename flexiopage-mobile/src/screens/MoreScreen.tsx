import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { walletApi, extractApiError } from '../lib/api';
import { useAuthStore } from '../stores/auth-store';
import { useStoreStore } from '../stores/store-store';
import type { Wallet } from '../types';
import { colors, formatMoney } from '../theme';

export function MoreScreen() {
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const store = useStoreStore((s) => s.current);
  const setCurrent = useStoreStore((s) => s.setCurrent);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [walletErr, setWalletErr] = useState<string | null>(null);

  useEffect(() => {
    walletApi
      .get()
      .then((r) => setWallet(r.data.wallet))
      .catch((e) => setWalletErr(extractApiError(e, '')));
  }, []);

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
      {/* Compte */}
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarTxt}>{(user?.name || '?').charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{user?.name}</Text>
          <Text style={styles.email}>{user?.email}</Text>
        </View>
      </View>

      {/* Wallet */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Portefeuille</Text>
        <Row
          icon="wallet-outline"
          label="Solde principal"
          value={
            wallet
              ? formatMoney(wallet.balance, wallet.currency)
              : walletErr
                ? '—'
                : '…'
          }
        />
        <Row
          icon="sparkles-outline"
          label="Crédits IA"
          value={wallet ? `${wallet.aiBalance} tokens` : walletErr ? '—' : '…'}
        />
      </View>

      {/* Boutique active */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Boutique active</Text>
        <Row icon="storefront-outline" label={store?.name || '—'} value={`/${store?.slug || ''}`} />
        <TouchableOpacity style={styles.action} onPress={() => setCurrent(null)}>
          <Ionicons name="swap-horizontal" size={20} color={colors.primary} />
          <Text style={styles.actionTxt}>Changer de boutique</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} style={{ marginLeft: 'auto' }} />
        </TouchableOpacity>
      </View>

      {/* Déconnexion */}
      <TouchableOpacity style={styles.logout} onPress={signOut}>
        <Ionicons name="log-out-outline" size={20} color={colors.danger} />
        <Text style={styles.logoutTxt}>Se déconnecter</Text>
      </TouchableOpacity>

      <Text style={styles.version}>FlexioPage Marchand · v0.1</Text>
    </ScrollView>
  );
}

function Row({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={20} color={colors.muted} />
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 32 },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTxt: { color: colors.primaryText, fontSize: 22, fontWeight: '800' },
  name: { fontSize: 17, fontWeight: '700', color: colors.text },
  email: { fontSize: 14, color: colors.muted, marginTop: 2 },
  section: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  rowLabel: { fontSize: 15, color: colors.text, flex: 1 },
  rowValue: { fontSize: 15, color: colors.muted, fontWeight: '600' },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actionTxt: { fontSize: 15, color: colors.primary, fontWeight: '600' },
  logout: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 16,
    marginTop: 24,
  },
  logoutTxt: { color: colors.danger, fontWeight: '700', fontSize: 15 },
  version: { textAlign: 'center', color: colors.muted, fontSize: 12, marginTop: 20 },
});
