import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Dimensions, TouchableOpacity, TextInput, Alert, Image, Linking, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { Recipe } from '../../types/recipe';
import { useKeepAwake } from 'expo-keep-awake';
import * as Speech from 'expo-speech';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [shareEmail, setShareEmail] = useState('');
  const [newComment, setNewComment] = useState('');
  
  useKeepAwake();

  const scrollViewRef = useRef<ScrollView>(null);
  const scrollY = useRef(0);

  useEffect(() => {
    const fetchRecipe = async () => {
      try {
        const docRef = doc(db, 'recipes', id as string);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setRecipe(docSnap.data() as Recipe);
        }
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    fetchRecipe();
  }, [id]);

  useEffect(() => {
    const startListening = async () => {
      const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (result.granted) {
        ExpoSpeechRecognitionModule.start({
          lang: 'ja-JP',
          continuous: true,
          interimResults: false,
        });
      }
    };
    startListening();

    return () => {
      ExpoSpeechRecognitionModule.stop();
      Speech.stop();
    };
  }, []);

  useSpeechRecognitionEvent("result", (event) => {
    const transcript = event.results[0]?.transcript?.toLowerCase() || "";
    const scrollAmount = SCREEN_HEIGHT * 0.8;

    if (transcript.includes('次')) {
      scrollY.current += scrollAmount;
      scrollViewRef.current?.scrollTo({ y: scrollY.current, animated: true });
    } else if (transcript.includes('戻る')) {
      scrollY.current = Math.max(0, scrollY.current - scrollAmount);
      scrollViewRef.current?.scrollTo({ y: scrollY.current, animated: true });
    } else if (transcript.includes('最初から')) {
      scrollY.current = 0;
      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    } else if (transcript.includes('材料を読んで')) {
      if (recipe) {
        const textToRead = "材料を読み上げます。" + recipe.ingredients.join('、');
        Speech.speak(textToRead, { language: 'ja-JP' });
      }
    }
  });

  const handleShare = async () => {
    if (!shareEmail) return;
    try {
      const docRef = doc(db, 'recipes', id as string);
      await updateDoc(docRef, {
        sharedWith: arrayUnion(shareEmail.toLowerCase())
      });
      Alert.alert('成功', `${shareEmail} と共有しました！`);
      setShareEmail('');
    } catch (error: any) {
      Alert.alert('エラー', '共有に失敗しました: ' + error.message);
    }
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    try {
      const docRef = doc(db, 'recipes', id as string);
      await updateDoc(docRef, {
        comments: arrayUnion(newComment.trim())
      });
      // ローカルのステートも更新
      setRecipe(prev => prev ? { ...prev, comments: [...(prev.comments || []), newComment.trim()] } : prev);
      setNewComment('');
    } catch (error: any) {
      Alert.alert('エラー', 'コメントの保存に失敗しました: ' + error.message);
    }
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#4285F4" /></View>;
  }

  if (!recipe) {
    return <View style={styles.center}><Text>レシピが見つかりません</Text></View>;
  }

  return (
    <KeyboardAvoidingView 
      style={{ flex: 1 }} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 20}
    >
      <ScrollView 
        ref={scrollViewRef}
        style={styles.container}
        onScroll={(e) => { scrollY.current = e.nativeEvent.contentOffset.y; }}
        scrollEventThrottle={16}
      >
        <Text style={styles.title}>{recipe.title}</Text>
        
        {recipe.imageUrl ? (
          <Image source={{ uri: recipe.imageUrl }} style={styles.heroImage} />
        ) : null}
        
        {recipe.url ? (
          <TouchableOpacity onPress={() => Linking.openURL(recipe.url)} style={styles.sourceLinkContainer}>
            <Text style={styles.sourceLinkText}>元のWebサイトを見る 🔗</Text>
          </TouchableOpacity>
        ) : null}
      
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>材料</Text>
        {recipe.ingredients?.map((item, index) => (
          <Text key={index} style={styles.itemText}>・ {item}</Text>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>作り方</Text>
        {recipe.instructions?.map((step, index) => (
          <Text key={index} style={styles.itemText}>{index + 1}. {step}</Text>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>メモ / コメント</Text>
        {recipe.comments && recipe.comments.length > 0 ? (
          recipe.comments.map((comment, index) => (
            <View key={index} style={styles.commentBox}>
              <Text style={styles.commentText}>{comment}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.emptyCommentText}>まだコメントはありません</Text>
        )}
        <View style={styles.commentInputContainer}>
          <TextInput
            style={styles.commentInput}
            placeholder="コメントを追加..."
            value={newComment}
            onChangeText={setNewComment}
            multiline
          />
          <TouchableOpacity style={styles.commentButton} onPress={handleAddComment}>
            <Text style={styles.commentButtonText}>送信</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.shareSection}>
        <Text style={styles.sectionTitle}>他の人にシェアする</Text>
        <Text style={styles.shareHint}>共有したい相手のGoogleアカウント（メールアドレス）を入力してください。</Text>
        <View style={styles.shareInputContainer}>
          <TextInput 
            style={styles.shareInput} 
            placeholder="メールアドレス" 
            value={shareEmail}
            onChangeText={setShareEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
            <Text style={styles.shareButtonText}>共有</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={{ height: 100 }} />
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 20 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 26, fontWeight: 'bold', marginBottom: 15, color: '#333' },
  heroImage: { width: '100%', height: 200, borderRadius: 12, marginBottom: 25, backgroundColor: '#f0f0f0' },
  section: { marginBottom: 30 },
  sectionTitle: { fontSize: 20, fontWeight: 'bold', borderBottomWidth: 2, borderBottomColor: '#f0f0f0', paddingBottom: 8, marginBottom: 15, color: '#4285F4' },
  itemText: { fontSize: 16, lineHeight: 28, color: '#444', marginBottom: 10 },
  commentBox: { backgroundColor: '#f5f5f5', padding: 12, borderRadius: 8, marginBottom: 10 },
  commentText: { fontSize: 15, color: '#333' },
  emptyCommentText: { fontSize: 14, color: '#888', fontStyle: 'italic', marginBottom: 10 },
  commentInputContainer: { flexDirection: 'row', marginTop: 10 },
  commentInput: { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 10, marginRight: 10, minHeight: 40 },
  commentButton: { backgroundColor: '#4285F4', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 15, borderRadius: 8 },
  commentButtonText: { color: '#fff', fontWeight: 'bold' },
  shareSection: { marginTop: 10, padding: 15, backgroundColor: '#f9f9f9', borderRadius: 12 },
  shareHint: { fontSize: 13, color: '#666', marginBottom: 15 },
  shareInputContainer: { flexDirection: 'row' },
  shareInput: { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 15, paddingVertical: 10, marginRight: 10 },
  shareButton: { backgroundColor: '#4285F4', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, borderRadius: 8 },
  shareButtonText: { color: '#fff', fontWeight: 'bold' },
  sourceLinkContainer: { marginBottom: 20, alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 15, backgroundColor: '#f0f5ff', borderRadius: 8, borderWidth: 1, borderColor: '#d0e0ff' },
  sourceLinkText: { color: '#4285F4', fontWeight: 'bold', fontSize: 14 }
});
