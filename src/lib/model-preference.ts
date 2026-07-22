import { GEMINI_TEXT_MODEL_LABEL } from '@/lib/ai-models';

export type AIModel = 'claude' | 'gemini';
export const MODEL_STORAGE_KEY = 'lumina_ai_model';

export function getSavedModel(): AIModel {
  if (typeof window === 'undefined') return 'claude';
  return (localStorage.getItem(MODEL_STORAGE_KEY) as AIModel) ?? 'claude';
}

export function saveModel(model: AIModel) {
  localStorage.setItem(MODEL_STORAGE_KEY, model);
}

// ModelBadge コンポーネントの CONFIG と一致させる
export function getModelLabel(model: AIModel): string {
  return model === 'gemini' ? GEMINI_TEXT_MODEL_LABEL : 'Claude Sonnet 4.6';
}

export function getModelIcon(model: AIModel): string {
  return model === 'gemini' ? '✨' : '🤖';
}
