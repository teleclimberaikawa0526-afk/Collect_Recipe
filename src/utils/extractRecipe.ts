export async function extractRecipeFromUrl(url: string): Promise<{ title: string; imageUrl: string; ingredients: string[]; instructions: string[] }> {
  try {
    // 1. URLからHTMLを取得
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch the URL');
    let html = await response.text();

    // 軽量化のため、不要なタグ（script, style, svg, コメント）を削除
    html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    html = html.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
    html = html.replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '');
    html = html.replace(/<!--[\s\S]*?-->/g, '');

    // Gemini 3.5 Flashは最大100万トークン対応のため、余裕を持って30万文字まで渡す
    const processedHtml = html.length > 300000 ? html.substring(0, 300000) : html;

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
      ${processedHtml}
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
