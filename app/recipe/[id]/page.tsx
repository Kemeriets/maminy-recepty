import { RecipeBook } from "../../book-client";

export default async function RecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RecipeBook initialView="catalog" initialRecipeId={id} />;
}
