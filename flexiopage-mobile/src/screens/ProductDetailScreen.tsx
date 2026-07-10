import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  TextInput,
  TouchableOpacity,
  Switch,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { productsApi, extractApiError } from '../lib/api';
import { useStoreStore } from '../stores/store-store';
import type { ProductsStackParamList } from '../navigation/types';
import type { Product } from '../types';
import { colors } from '../theme';

type Props = NativeStackScreenProps<ProductsStackParamList, 'ProductDetail'>;

export function ProductDetailScreen({ route, navigation }: Props) {
  const store = useStoreStore((s) => s.current);
  const { productId } = route.params;
  const [product, setProduct] = useState<Product | null>(null);
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('');
  const [published, setPublished] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!store) return;
    try {
      const { data } = await productsApi.get(store._id, productId);
      setProduct(data.product);
      setPrice(String(data.product.price ?? ''));
      setStock(String(data.product.stock ?? ''));
      setPublished(!!data.product.isPublished);
    } catch (err) {
      setError(extractApiError(err, 'Impossible de charger le produit.'));
    } finally {
      setLoading(false);
    }
  }, [store, productId]);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!store || !product) return;
    setSaving(true);
    try {
      const { data } = await productsApi.update(store._id, productId, {
        price: Number(price) || 0,
        stock: Number(stock) || 0,
        isPublished: published,
      });
      setProduct(data.product);
      Alert.alert('Enregistré', 'Le produit a été mis à jour.');
    } catch (err) {
      Alert.alert('Erreur', extractApiError(err, 'Enregistrement impossible.'));
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete() {
    Alert.alert('Supprimer le produit', 'Cette action est définitive. Continuer ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          if (!store) return;
          try {
            await productsApi.remove(store._id, productId);
            navigation.goBack();
          } catch (err) {
            Alert.alert('Erreur', extractApiError(err, 'Suppression impossible.'));
          }
        },
      },
    ]);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  if (!product) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>{error ?? 'Produit introuvable.'}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
      {product.images?.[0] ? (
        <Image source={{ uri: product.images[0] }} style={styles.hero} />
      ) : (
        <View style={[styles.hero, styles.heroPlaceholder]}>
          <Ionicons name="image-outline" size={40} color={colors.muted} />
        </View>
      )}

      <Text style={styles.name}>{product.name}</Text>
      <Text style={styles.type}>{product.type === 'digital' ? 'Produit digital' : 'Produit physique'}</Text>

      <View style={styles.section}>
        <Text style={styles.label}>Prix ({store?.currency || 'USD'})</Text>
        <TextInput
          style={styles.input}
          value={price}
          onChangeText={setPrice}
          keyboardType="numeric"
          placeholderTextColor={colors.muted}
        />

        {product.type === 'physical' ? (
          <>
            <Text style={styles.label}>Stock</Text>
            <TextInput
              style={styles.input}
              value={stock}
              onChangeText={setStock}
              keyboardType="numeric"
              placeholderTextColor={colors.muted}
            />
          </>
        ) : null}

        <View style={styles.switchRow}>
          <Text style={styles.label}>Publié (visible en boutique)</Text>
          <Switch
            value={published}
            onValueChange={setPublished}
            trackColor={{ true: colors.primary }}
          />
        </View>
      </View>

      <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}>
        {saving ? (
          <ActivityIndicator color={colors.primaryText} />
        ) : (
          <Text style={styles.saveTxt}>Enregistrer</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.deleteBtn} onPress={confirmDelete}>
        <Ionicons name="trash-outline" size={18} color={colors.danger} />
        <Text style={styles.deleteTxt}>Supprimer le produit</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  hero: { width: '100%', height: 200, borderRadius: 16, backgroundColor: colors.card },
  heroPlaceholder: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  name: { fontSize: 22, fontWeight: '800', color: colors.text, marginTop: 16 },
  type: { fontSize: 14, color: colors.muted, marginTop: 4 },
  section: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginTop: 20,
  },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6, marginTop: 10 },
  input: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 20,
  },
  saveTxt: { color: colors.primaryText, fontSize: 16, fontWeight: '700' },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 16,
    marginTop: 8,
  },
  deleteTxt: { color: colors.danger, fontWeight: '600' },
  empty: { color: colors.muted, paddingHorizontal: 24, textAlign: 'center' },
});
