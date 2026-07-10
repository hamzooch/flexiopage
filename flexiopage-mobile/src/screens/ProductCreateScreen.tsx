import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { productsApi, extractApiError } from '../lib/api';
import { useStoreStore } from '../stores/store-store';
import type { ProductsStackParamList } from '../navigation/types';
import type { ProductType as PType } from '../types';
import { colors } from '../theme';

type Props = NativeStackScreenProps<ProductsStackParamList, 'ProductCreate'>;

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function ProductCreateScreen({ navigation }: Props) {
  const store = useStoreStore((s) => s.current);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [type, setType] = useState<PType>('physical');
  const [saving, setSaving] = useState(false);

  const canSubmit = name.trim().length > 0 && Number(price) > 0 && !saving;

  async function create() {
    if (!store) return;
    setSaving(true);
    try {
      const { data } = await productsApi.create(store._id, {
        name: name.trim(),
        slug: slugify(name),
        price: Number(price),
        type,
        ...(type === 'digital' ? { digitalKind: 'download' } : {}),
      });
      // Remplace l'écran de création par le détail du produit créé.
      navigation.replace('ProductDetail', { productId: data.product._id });
    } catch (err) {
      Alert.alert('Erreur', extractApiError(err, 'Création impossible.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Nom du produit</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Ex. T-shirt premium"
          placeholderTextColor={colors.muted}
          editable={!saving}
        />

        <Text style={styles.label}>Prix ({store?.currency || 'USD'})</Text>
        <TextInput
          style={styles.input}
          value={price}
          onChangeText={setPrice}
          placeholder="0"
          placeholderTextColor={colors.muted}
          keyboardType="numeric"
          editable={!saving}
        />

        <Text style={styles.label}>Type de produit</Text>
        <View style={styles.typeRow}>
          {(['physical', 'digital'] as PType[]).map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.typeBtn, type === t && styles.typeBtnActive]}
              onPress={() => setType(t)}
              disabled={saving}
            >
              <Text style={[styles.typeTxt, type === t && styles.typeTxtActive]}>
                {t === 'physical' ? 'Physique' : 'Digital'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.btn, !canSubmit && styles.btnDisabled]}
          onPress={create}
          disabled={!canSubmit}
        >
          {saving ? (
            <ActivityIndicator color={colors.primaryText} />
          ) : (
            <Text style={styles.btnTxt}>Créer le produit</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.hint}>
          Tu pourras ensuite ajouter images, description et stock depuis la fiche produit.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16 },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6, marginTop: 14 },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
  },
  typeRow: { flexDirection: 'row', gap: 10 },
  typeBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: colors.card,
  },
  typeBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  typeTxt: { fontSize: 15, fontWeight: '600', color: colors.text },
  typeTxtActive: { color: colors.primaryText },
  btn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 28,
  },
  btnDisabled: { opacity: 0.5 },
  btnTxt: { color: colors.primaryText, fontSize: 16, fontWeight: '700' },
  hint: { color: colors.muted, fontSize: 13, marginTop: 16, textAlign: 'center' },
});
