import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TextInput, TouchableOpacity, FlatList, ActivityIndicator, Alert, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { collection, addDoc, query, where, onSnapshot, or } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../hooks/useAuth';
import { extractRecipeFromUrl } from '../utils/extractRecipe';
import { Recipe } from '../types/recipe';

export default function HomeScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [recipes, setRecipes] = useState<Recipe[]>([]);

  useEffect(() => {
    if (!user || !user.email) return;
    
    const q = query(
      collection(db, 'recipes'),
      or(
        where('ownerId', '==', user.uid),
        where('sharedWith', 'array-contains', user.email)
      )
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Recipe[];
      
      // Sort in memory (newest first)
      fetched.sort((a, b) => b.createdAt - a.createdAt);
      setRecipes(fetched);
    });

    return unsubscribe;
  }, [user]);

  const handleAddRecipe = async () => {
    if (!url) {
      Alert.alert('エラー', 'URLを入力してください');
      return;
    }
    if (!user) return;

    setLoading(true);
    try {
      const recipeData = await extractRecipeFromUrl(url);
      
      const newRecipe: Recipe = {
        ...recipeData,
        url,
        createdAt: Date.now(),
        ownerId: user.uid,
        sharedWith: [],
        comments: [],
      };

      await addDoc(collection(db, 'recipes'), newRecipe);
      Alert.alert('成功', 'レシピを保存しました！');
      setUrl('');
    } catch (error: any) {
      Alert.alert('エラー', 'レシピの取得に失敗しました: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const renderRecipe = ({ item }: { item: Recipe }) => (
    <TouchableOpacity 
      style={styles.recipeCard}
      onPress={() => router.push(`/recipe/${item.id}` as any)}
    >
      <View style={styles.recipeCardContent}>
        {item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} style={styles.recipeThumbnail} />
        ) : (
          <View style={[styles.recipeThumbnail, styles.placeholderThumbnail]} />
        )}
        <View style={styles.recipeTextContainer}>
          <Text style={styles.recipeTitle}>{item.title}</Text>
          <Text style={styles.recipeMeta}>材料: {item.ingredients?.length || 0}品 / 手順: {item.instructions?.length || 0}ステップ</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.headerTitle}>マイレシピ</Text>
      
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="レシピのURLを貼り付け"
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
        />
        <TouchableOpacity style={styles.addButton} onPress={handleAddRecipe} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.addButtonText}>追加</Text>}
        </TouchableOpacity>
      </View>

      <FlatList
        data={recipes}
        keyExtractor={item => item.id!}
        renderItem={renderRecipe}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={<Text style={styles.emptyText}>レシピがまだありません。</Text>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  headerTitle: { fontSize: 24, fontWeight: 'bold', margin: 20, color: '#333' },
  inputContainer: { flexDirection: 'row', paddingHorizontal: 20, marginBottom: 20 },
  input: { flex: 1, backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 15, paddingVertical: 12, marginRight: 10, borderWidth: 1, borderColor: '#ddd' },
  addButton: { backgroundColor: '#4285F4', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, borderRadius: 8 },
  addButtonText: { color: '#fff', fontWeight: 'bold' },
  listContainer: { paddingHorizontal: 20, paddingBottom: 20 },
  recipeCard: { backgroundColor: '#fff', padding: 15, borderRadius: 12, marginBottom: 15, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  recipeCardContent: { flexDirection: 'row', alignItems: 'center' },
  recipeThumbnail: { width: 60, height: 60, borderRadius: 8, marginRight: 15, backgroundColor: '#ddd' },
  placeholderThumbnail: { backgroundColor: '#e0e0e0' },
  recipeTextContainer: { flex: 1 },
  recipeTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 4 },
  recipeMeta: { fontSize: 12, color: '#666' },
  emptyText: { textAlign: 'center', color: '#888', marginTop: 40 }
});
