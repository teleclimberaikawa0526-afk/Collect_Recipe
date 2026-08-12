# Project Custom Rules & Learnings

## 1. Google OAuth Authentication (React Native / Expo)
- **Do not use standard Firebase JS SDK for Google Login in React Native.** The standard `signInWithPopup` or `signInWithRedirect` will not work properly in native environments (or require complex polyfills and often fail).
- **Recommended Library**: Use `@react-native-google-signin/google-signin`.
- **Implementation Pattern**:
  - Obtain the `idToken` from `@react-native-google-signin/google-signin`.
  - Pass the `idToken` to Firebase Auth using `GoogleAuthProvider.credential(idToken)`.
  - Sign in using `signInWithCredential(auth, credential)`.
- **Expo Setup**: Ensure you run `npx expo prebuild` or use EAS Build. `@react-native-google-signin/google-signin` requires native code integration.

## 2. Gemini API Usage & Optimization
- **Do not use overly large payloads for single pages.** Scraping huge HTML files (e.g. 300,000+ characters) can cause API timeouts or "High Demand" errors (Status 429/503).
  - **Optimization**: Strip unnecessary tags before sending HTML to Gemini:
    ```javascript
    html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    html = html.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
    html = html.replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '');
    html = html.replace(/<!--[\s\S]*?-->/g, '');
    ```
  - **Truncation Limit**: Cut the processed string at 100,000 characters to prevent API overload while maintaining sufficient context for recipes.
- **Handling Multi-page Content (Recursive Scraping)**:
  - When extracting data from sites that use pagination, instruct the AI to find the "Next Page URL".
  - If a next page URL is returned, the app should automatically fetch it (with a loop limit, e.g., max 5 pages).
- **API Resilience**: Always implement an exponential backoff or simple retry mechanism (e.g., 3 retries with a 3-second delay) specifically for `429` (Rate Limit) and `503` (High Demand) errors when calling AI APIs.

## 3. Expo EAS Build Secrets
- When storing API keys like `EXPO_PUBLIC_GEMINI_API_KEY`, ensure they are set in the EAS environment variables or `.env` files.
- Remember that native changes or new native libraries require a full `eas build` cycle. Pure JS updates can usually be previewed instantly in dev environments.

## 4. Keyboard Handling in React Native (Android / Expo)
- **Issue**: When inputting text, the software keyboard can overlap and hide the `TextInput`.
- **Solution**: Use `KeyboardAvoidingView` from `react-native`. However, there are critical caveats for Android.
- **Android `behavior` caveat**: While `behavior={undefined}` often works when `windowSoftInputMode="adjustResize"` is active, Edge-to-Edge layouts or transparent status bars often break this. **Always explicitly use `behavior={'padding'}` (or `height`) for Android as well.**
  ```tsx
  <KeyboardAvoidingView 
    style={{ flex: 1 }} 
    behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
    keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 20} 
  >
  ```
- **The `<Modal>` caveat (Android)**: React Native's `<Modal transparent={true}>` opens in a separate window on Android, causing `KeyboardAvoidingView` to **fail completely**. 
  - **Workaround**: Do NOT use `<Modal>` for simple popups containing TextInputs on Android. Instead, conditionally render a full-screen absolute View (`StyleSheet.absoluteFill`) at the root level of your component tree, wrapped in a `KeyboardAvoidingView`.
  ```tsx
  {isModalVisible && (
    <KeyboardAvoidingView 
      style={[StyleSheet.absoluteFill, { zIndex: 1000, elevation: 10 }]} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.modalOverlay}>
        {/* Modal content with TextInput */}
      </View>
    </KeyboardAvoidingView>
  )}
  ```
