import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { statusColor } from '../theme';

export function Badge({ label, status }: { label: string; status?: string }) {
  const color = statusColor(status ?? label);
  return (
    <View style={[styles.badge, { backgroundColor: `${color}1a`, borderColor: color }]}>
      <Text style={[styles.text, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
  },
  text: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
});
