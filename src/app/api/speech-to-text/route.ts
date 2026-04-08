/**
 * 音声文字起こし・テキスト補正API
 * POST:
 *   mode=audio: 音声データ（base64）をGemini APIで文字起こし
 *   mode=correct: 音声認識テキストをGemini APIで補正
 */

import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export const maxDuration = 60;

let _genai: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI {
  if (!_genai) {
    const apiKey = process.env.GEMINI_API_KEY?.replace(/[^\x20-\x7E]/g, "") || "";
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
    _genai = new GoogleGenAI({ apiKey });
  }
  return _genai;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { mode, audio, mimeType, text } = body;

    const genai = getGenAI();

    // テキスト補正モード（SpeechRecognition結果を補正）
    if (mode === "correct") {
      if (!text?.trim()) {
        return NextResponse.json({ error: "テキストが必要です" }, { status: 400 });
      }

      const response = await genai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `以下は音声認識の結果です。ビジネス・経営・AI・テクノロジーの文脈で誤認識を修正してください。修正後のテキストのみ返してください。説明や注釈は不要です。元のテキストが正しい場合はそのまま返してください。\n\n${text}`,
        config: {
          temperature: 0.1,
          maxOutputTokens: 1024,
        },
      });

      const corrected = response.text?.trim() || text;
      return NextResponse.json({ transcript: corrected });
    }

    // 音声文字起こしモード（フォールバック用）
    if (!audio) {
      return NextResponse.json({ error: "音声データが必要です" }, { status: 400 });
    }

    const response = await genai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: mimeType || "audio/webm",
                data: audio,
              },
            },
            {
              text: "以下の音声を正確に日本語で文字起こししてください。句読点も適切に入れてください。文字起こし結果のみを出力し、説明や注釈は不要です。",
            },
          ],
        },
      ],
      config: {
        temperature: 0.1,
        maxOutputTokens: 1024,
      },
    });

    const transcript = response.text?.trim() || "";

    if (!transcript) {
      return NextResponse.json({ error: "文字起こしに失敗しました" }, { status: 500 });
    }

    return NextResponse.json({ transcript });
  } catch (error) {
    console.error("音声文字起こしエラー:", error);
    return NextResponse.json(
      { error: "文字起こしに失敗しました" },
      { status: 500 }
    );
  }
}
