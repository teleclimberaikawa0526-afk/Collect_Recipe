import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TextInput, TouchableOpacity, FlatList, ActivityIndicator, Alert, Image, Modal, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { collection, addDoc, query, where, onSnapshot, or, deleteDoc, doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../hooks/useAuth';
import { extractRecipeFromUrl } from '../utils/extractRecipe';
import { Recipe } from '../types/recipe';
import { Ionicons } from '@expo/vector-icons';

export default function HomeScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  
  // Selection mode states
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  // Modals
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [shareEmail, setShareEmail] = useState('');
  const [guideModalVisible, setGuideModalVisible] = useState(false);

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

  const handleDelete = (id: string, ownerId: string) => {
    if (ownerId !== user?.uid) {
      Alert.alert('エラー', '他の人が作成したレシピは削除できません。');
      return;
    }
    Alert.alert(
      '確認',
      'このレシピを削除してもよろしいですか？',
      [
        { text: 'キャンセル', style: 'cancel' },
        { 
          text: '削除', 
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDoc(doc(db, 'recipes', id));
            } catch (error: any) {
              Alert.alert('エラー', '削除に失敗しました: ' + error.message);
            }
          }
        }
      ]
    );
  };

  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleBulkShare = async () => {
    if (!shareEmail.trim()) {
      Alert.alert('エラー', 'メールアドレスを入力してください');
      return;
    }
    if (selectedIds.size === 0) return;

    try {
      const promises = Array.from(selectedIds).map(id => {
        return updateDoc(doc(db, 'recipes', id), {
          sharedWith: arrayUnion(shareEmail.toLowerCase().trim())
        });
      });
      await Promise.all(promises);
      
      Alert.alert('成功', `${selectedIds.size}件のレシピを共有しました！`);
      setShareModalVisible(false);
      setIsSelectMode(false);
      setSelectedIds(new Set());
      setShareEmail('');
    } catch (error: any) {
      Alert.alert('エラー', '共有に失敗しました: ' + error.message);
    }
  };

  const renderRecipe = ({ item }: { item: Recipe }) => {
    const isSelected = selectedIds.has(item.id!);
    
    return (
      <TouchableOpacity 
        style={[styles.recipeCard, isSelected && styles.recipeCardSelected]}
        onPress={() => {
          if (isSelectMode) {
            toggleSelection(item.id!);
          } else {
            router.push(`/recipe/${item.id}` as any);
          }
        }}
        onLongPress={() => {
          if (!isSelectMode) {
            setIsSelectMode(true);
            toggleSelection(item.id!);
          }
        }}
      >
        <View style={styles.recipeCardContent}>
          {isSelectMode && (
            <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
              {isSelected && <Text style={styles.checkmark}>✓</Text>}
            </View>
          )}
          
          {item.imageUrl ? (
            <Image source={{ uri: item.imageUrl }} style={styles.recipeThumbnail} />
          ) : (
            <View style={[styles.recipeThumbnail, styles.placeholderThumbnail]} />
          )}
          <View style={styles.recipeTextContainer}>
            <Text style={styles.recipeTitle}>{item.title}</Text>
            <Text style={styles.recipeMeta}>材料: {item.ingredients?.length || 0}品 / 手順: {item.instructions?.length || 0}ステップ</Text>
          </View>
          
          {!isSelectMode && item.ownerId === user?.uid && (
            <TouchableOpacity style={styles.deleteButton} onPress={() => handleDelete(item.id!, item.ownerId)}>
              <Text style={styles.deleteButtonText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>マイレシピ</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity 
            style={styles.guideButton}
            onPress={() => setGuideModalVisible(true)}
          >
            <Ionicons name="mic-circle-outline" size={24} color="#4285F4" />
            <Text style={styles.guideButtonText}>音声ガイド</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.selectModeButton}
            onPress={() => {
              if (isSelectMode) {
                setSelectedIds(new Set());
              }
              setIsSelectMode(!isSelectMode);
            }}
          >
            <Text style={styles.selectModeText}>{isSelectMode ? 'キャンセル' : '選択'}</Text>
          </TouchableOpacity>
        </View>
      </View>
      
      {!isSelectMode && (
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
      )}

      {isSelectMode && (
        <View style={styles.bulkActionContainer}>
          <Text style={styles.selectionCount}>{selectedIds.size}件 選択中</Text>
          <TouchableOpacity 
            style={[styles.bulkShareButton, selectedIds.size === 0 && styles.disabledButton]}
            disabled={selectedIds.size === 0}
            onPress={() => setShareModalVisible(true)}
          >
            <Text style={styles.bulkShareText}>まとめてシェア</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={recipes}
        keyExtractor={item => item.id!}
        renderItem={renderRecipe}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={<Text style={styles.emptyText}>レシピがまだありません。</Text>}
      />

      {/* Share Modal */}
      <Modal visible={shareModalVisible} transparent animationType="fade">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>まとめてシェア</Text>
            <Text style={styles.modalDesc}>{selectedIds.size}件のレシピを共有する相手のGoogleメールアドレスを入力してください。</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="メールアドレス"
              value={shareEmail}
              onChangeText={setShareEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setShareModalVisible(false)}>
                <Text style={styles.modalCancelText}>キャンセル</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSubmit} onPress={handleBulkShare}>
                <Text style={styles.modalSubmitText}>共有する</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Voice Guide Modal */}
      <Modal visible={guideModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.guideContent}>
            <Text style={styles.modalTitle}>🎙️ 音声コントロールの使い方</Text>
            <ScrollView style={styles.guideScroll}>
              <Text style={styles.guideDesc}>レシピ詳細画面では、料理中で手が離せない時でも、声を使ってハンズフリーで操作ができます！スマホに向かって以下のようにお話しください。</Text>
              
              <View style={styles.guideItem}>
                <Text style={styles.guideCommand}>「次」</Text>
                <Text style={styles.guideDetail}>画面を少し下へスクロールします。</Text>
              </View>
              
              <View style={styles.guideItem}>
                <Text style={styles.guideCommand}>「戻る」</Text>
                <Text style={styles.guideDetail}>画面を少し上へスクロールします。</Text>
              </View>

              <View style={styles.guideItem}>
                <Text style={styles.guideCommand}>「最初から」</Text>
                <Text style={styles.guideDetail}>画面の一番上まで一気に戻ります。</Text>
              </View>

              <View style={styles.guideItem}>
                <Text style={styles.guideCommand}>「材料を読んで」</Text>
                <Text style={styles.guideDetail}>そのレシピの材料をすべて音声で読み上げます。</Text>
              </View>

            </ScrollView>
            <TouchableOpacity style={styles.guideCloseButton} onPress={() => setGuideModalVisible(false)}>
              <Text style={styles.guideCloseButtonText}>閉じる</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 15 },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#333' },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  guideButton: { flexDirection: 'row', alignItems: 'center', marginRight: 15 },
  guideButtonText: { color: '#4285F4', fontWeight: 'bold', fontSize: 13, marginLeft: 4 },
  selectModeButton: { padding: 8, backgroundColor: '#eef2ff', borderRadius: 8 },
  selectModeText: { color: '#4285F4', fontWeight: 'bold' },
  inputContainer: { flexDirection: 'row', paddingHorizontal: 20, marginBottom: 20 },
  input: { flex: 1, backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 15, paddingVertical: 12, marginRight: 10, borderWidth: 1, borderColor: '#ddd' },
  addButton: { backgroundColor: '#4285F4', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, borderRadius: 8 },
  addButtonText: { color: '#fff', fontWeight: 'bold' },
  bulkActionContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 15, backgroundColor: '#eef2ff', paddingVertical: 12, marginHorizontal: 20, borderRadius: 8 },
  selectionCount: { fontWeight: 'bold', color: '#333' },
  bulkShareButton: { backgroundColor: '#4285F4', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 6 },
  bulkShareText: { color: '#fff', fontWeight: 'bold' },
  disabledButton: { backgroundColor: '#a0c0f9' },
  listContainer: { paddingHorizontal: 20, paddingBottom: 20 },
  recipeCard: { backgroundColor: '#fff', padding: 15, borderRadius: 12, marginBottom: 15, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  recipeCardSelected: { borderColor: '#4285F4', borderWidth: 2 },
  recipeCardContent: { flexDirection: 'row', alignItems: 'center' },
  checkbox: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#ddd', marginRight: 15, justifyContent: 'center', alignItems: 'center' },
  checkboxSelected: { backgroundColor: '#4285F4', borderColor: '#4285F4' },
  checkmark: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  recipeThumbnail: { width: 60, height: 60, borderRadius: 8, marginRight: 15, backgroundColor: '#ddd' },
  placeholderThumbnail: { backgroundColor: '#e0e0e0' },
  recipeTextContainer: { flex: 1 },
  recipeTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 4 },
  recipeMeta: { fontSize: 12, color: '#666' },
  deleteButton: { padding: 10 },
  deleteButtonText: { color: '#ff4444', fontSize: 18, fontWeight: 'bold' },
  emptyText: { textAlign: 'center', color: '#888', marginTop: 40 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '85%', backgroundColor: '#fff', borderRadius: 12, padding: 20 },
  guideContent: { width: '90%', maxHeight: '80%', backgroundColor: '#fff', borderRadius: 16, padding: 20 },
  guideScroll: { marginVertical: 15 },
  guideDesc: { fontSize: 14, color: '#555', lineHeight: 22, marginBottom: 20 },
  guideItem: { marginBottom: 15, backgroundColor: '#f8f9fa', padding: 15, borderRadius: 8, borderWidth: 1, borderColor: '#eef2ff' },
  guideCommand: { fontSize: 16, fontWeight: 'bold', color: '#4285F4', marginBottom: 5 },
  guideDetail: { fontSize: 14, color: '#333', lineHeight: 20 },
  guideCloseButton: { backgroundColor: '#4285F4', padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  guideCloseButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 10, color: '#333' },
  modalDesc: { fontSize: 14, color: '#666', marginBottom: 20, lineHeight: 20 },
  modalInput: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 20 },
  modalButtons: { flexDirection: 'row', justifyContent: 'flex-end' },
  modalCancel: { padding: 12, marginRight: 10 },
  modalCancelText: { color: '#666', fontWeight: 'bold' },
  modalSubmit: { backgroundColor: '#4285F4', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8 },
  modalSubmitText: { color: '#fff', fontWeight: 'bold' }
});
