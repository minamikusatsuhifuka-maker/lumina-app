import { CLAUDE_TEXT_MODEL_LABEL, GEMINI_TEXT_MODEL_LABEL, DEFAULT_AI_MODEL } from '@/lib/ai-models';

export type AIModel = 'claude' | 'gemini';

// 244: 既定をGeminiに変えたので保存キーも切り替える。
// 旧キー(lumina_ai_model)の値は読まない＝「既定だったから保存されていたclaude」を
// 引きずらず、新方針から始める。以後Claudeを選んだ場合はそれが明示選択として残る。
export const MODEL_STORAGE_KEY = 'lumina_ai_model_v2';

export function getSavedModel(): AIModel {
  if (typeof window === 'undefined') return DEFAULT_AI_MODEL;
  const saved = localStorage.getItem(MODEL_STORAGE_KEY);
  // 不正値・未設定はすべて既定（Gemini）に倒す
  return saved === 'claude' || saved === 'gemini' ? saved : DEFAULT_AI_MODEL;
}

export function saveModel(model: AIModel) {
  localStorage.setItem(MODEL_STORAGE_KEY, model);
}

// ModelBadge コンポーネントの CONFIG と一致させる
export function getModelLabel(model: AIModel): string {
  return model === 'gemini' ? GEMINI_TEXT_MODEL_LABEL : CLAUDE_TEXT_MODEL_LABEL;
}

export function getModelIcon(model: AIModel): string {
  return model === 'gemini' ? '✨' : '🤖';
}
