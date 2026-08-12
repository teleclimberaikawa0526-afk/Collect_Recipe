export async function extractRecipeFromUrl(baseUrl: string): Promise<{ title: string; imageUrl: string; ingredients: string[]; instructions: string[] }> {
  try {
    const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
    if (!GEMINI_API_KEY) throw new Error('Gemini API key is missing');
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    let currentUrl = baseUrl;
    let pagesFetched = 0;
    const maxPages = 5; // 無限ループ防止のため最大5ページまで

    let finalTitle = 'タイトルなし';
    let finalImageUrl = '';
    let finalIngredients: string[] = [];
    let finalInstructions: string[] = [];

    while (currentUrl && pagesFetched < maxPages) {
      console.log(`Fetching page ${pagesFetched + 1}: ${currentUrl}`);
      const response = await fetch(currentUrl);
      if (!response.ok) throw new Error(`Failed to fetch the URL: ${currentUrl}`);
      let html = await response.text();

      // 軽量化のため、不要なタグを削除
      html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      html = html.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
      html = html.replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '');
      html = html.replace(/<!--[\s\S]*?-->/g, '');

      const processedHtml = html.length > 100000 ? html.substring(0, 100000) : html;

      const prompt = `
        以下のWebページのHTML内容から、料理のレシピ情報を抽出してください。
        出力は必ず以下のJSON形式のみで行い、他の文章は一切含めないでください。

        {
          "title": "レシピのタイトル",
          "imageUrl": "メインの料理画像のURL（見つからない場合は空文字）",
          "ingredients": ["材料1", "材料2", ...],
          "instructions": ["手順1", "手順2", ...],
          "nextPageUrl": "もしレシピの手順の続きなどが次のページにまたがっており、『次へ』などのリンクURLがある場合は、その完全なURL（絶対URL）をここに入れてください。絶対URLが不明な場合は現在のページのURL（ ${currentUrl} ）を元に完全なURLを構築してください。もし続きのページがない場合や判断できない場合は空文字にしてください。"
        }

        HTML内容:
        ${processedHtml}
      `;

      let geminiRes;
      let data;
      let retries = 3;
      
      while (retries > 0) {
        geminiRes = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" }
          })
        });

        data = await geminiRes.json();
        
        if (geminiRes.ok) {
          break;
        } else if (data.error?.message?.includes('high demand') || geminiRes.status === 429 || geminiRes.status === 503) {
          retries--;
          console.warn(`Gemini API high demand, retries left: ${retries}`);
          if (retries === 0) {
            throw new Error('現在AIサーバーが非常に混み合っています。少し時間をおいてから再度お試しください。');
          }
          await new Promise(resolve => setTimeout(resolve, 3000)); // 3秒待機してリトライ
        } else {
          throw new Error(data.error?.message || 'Failed to extract recipe from AI');
        }
      }

      const text = data.candidates[0].content.parts[0].text;
      const recipeData = JSON.parse(text);

      // 1ページ目のデータをベースとして保存
      if (pagesFetched === 0) {
        finalTitle = recipeData.title || finalTitle;
        finalImageUrl = recipeData.imageUrl || finalImageUrl;
      }
      
      // 材料は1ページ目のみから取得する（2ページ目以降の不要な取得を防ぐ）
      if (pagesFetched === 0 && recipeData.ingredients) {
        finalIngredients = recipeData.ingredients;
      }

      // 手順をマージ
      if (recipeData.instructions) {
        finalInstructions = [...finalInstructions, ...recipeData.instructions];
      }

      // 次のページがあるかチェック
      if (recipeData.nextPageUrl && recipeData.nextPageUrl.startsWith('http') && recipeData.nextPageUrl !== currentUrl) {
        // セキュリティのため、元のドメインと同じか簡易チェック（外部サイトへの逸脱防止）
        try {
          const originalDomain = new URL(baseUrl).hostname;
          const nextDomain = new URL(recipeData.nextPageUrl).hostname;
          if (originalDomain === nextDomain) {
            currentUrl = recipeData.nextPageUrl;
          } else {
            currentUrl = ''; // 違うドメインなら終了
          }
        } catch (e) {
          currentUrl = '';
        }
      } else {
        currentUrl = ''; // 次のページがなければループ終了
      }

      pagesFetched++;
    }

    return {
      title: finalTitle,
      imageUrl: finalImageUrl,
      ingredients: finalIngredients,
      instructions: finalInstructions
    };
  } catch (error) {
    console.error('Recipe Extraction Error:', error);
    throw error;
  }
}
