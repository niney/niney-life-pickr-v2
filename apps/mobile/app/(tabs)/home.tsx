import { useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRandomPick, usePicks } from '@repo/shared';

export default function HomeScreen() {
  const { data: picks, isLoading } = usePicks();
  const random = useRandomPick();
  const [result, setResult] = useState<string | null>(null);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <Text>Loading…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>내 Pick</Text>
      <FlatList
        data={picks}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.category}>{item.category}</Text>
            <Text style={styles.options}>{item.options.join(' / ')}</Text>
            <TouchableOpacity
              style={styles.button}
              onPress={() =>
                random.mutate(item.id, {
                  onSuccess: (r) => setResult(r.chosen),
                })
              }
            >
              <Text style={styles.buttonText}>랜덤 픽!</Text>
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>아직 Pick이 없습니다.</Text>}
      />
      {result && (
        <View style={styles.result}>
          <Text>
            오늘의 선택: <Text style={styles.resultText}>{result}</Text>
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 12 },
  card: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#eee',
  },
  cardTitle: { fontSize: 18, fontWeight: '600' },
  category: { color: '#888', fontSize: 12, marginVertical: 4 },
  options: { marginBottom: 8 },
  button: {
    backgroundColor: '#2563eb',
    padding: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '600' },
  empty: { textAlign: 'center', color: '#888', marginTop: 40 },
  result: {
    marginTop: 16,
    padding: 16,
    backgroundColor: '#dbeafe',
    borderRadius: 8,
  },
  resultText: { fontWeight: '700' },
});
