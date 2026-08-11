export async function extractRecipeFromUrl(url: string): Promise<{ title: string; imageUrl: string; ingredients: string[]; instructions: string[] }> {
  try {
    // 1. URLからHTMLを取得
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch the URL');
    const html = await response.text();

    // 2. Gemini APIを使用して解析
    const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
    if (!GEMINI_API_KEY) throw new Error('Gemini API key is missing');

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    
    const prompt = `
      以下のWebページのHTML内容から、料理のレシピ情報を抽出してください。
      出力は必ず以下のJSON形式のみで行い、他の文章は一切含めないでください。

      {
        "title": "レシピのタイトル",
        "imageUrl": "メインの料理画像のURL（見つからない場合は空文字）",
        "ingredients": ["材料1", "材料2", ...],
        "instructions": ["手順1", "手順2", ...]
      }

      HTML内容:
      ${html.substring(0, 40000)} // HTMLが長すぎる場合の対策として先頭40000文字を渡す
    `;

    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json"
        }
      })
    });

    const data = await geminiRes.json();
    
    if (!geminiRes.ok) {
      throw new Error(data.error?.message || 'Failed to extract recipe from AI');
    }

    const text = data.candidates[0].content.parts[0].text;
    const recipeData = JSON.parse(text);

    return {
      title: recipeData.title || 'タイトルなし',
      imageUrl: recipeData.imageUrl || '',
      ingredients: recipeData.ingredients || [],
      instructions: recipeData.instructions || []
    };
  } catch (error) {
    console.error('Recipe Extraction Error:', error);
    throw error;
  }
}
