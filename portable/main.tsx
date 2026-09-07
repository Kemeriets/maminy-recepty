import { createRoot } from "react-dom/client";
import { RecipeBook } from "../app/book-client";
import "../app/globals.css";

const root = document.getElementById("root");
if (!root) throw new Error("Не найден корневой элемент приложения");

createRoot(root).render(<RecipeBook />);
