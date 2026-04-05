export type AIModel = 'claude' | 'gemini';
export const MODEL_STORAGE_KEY = 'lumina_ai_model';

export function getSavedModel(): AIModel {
  if (typeof window === 'undefined') return 'claude';
  return (localStorage.getItem(MODEL_STORAGE_KEY) as AIModel) ?? 'claude';
}

export function saveModel(model: AIModel) {
  localStorage.setItem(MODEL_STORAGE_KEY, model);
}
