export interface Recipe {
  id?: string;
  url?: string;
  title: string;
  imageUrl?: string;
  ingredients: string[];
  instructions: string[];
  comments?: string[];
  createdAt: number;
  ownerId: string;
  sharedWith: string[]; // 共有相手のメールアドレスまたはユーザーIDの配列
}
