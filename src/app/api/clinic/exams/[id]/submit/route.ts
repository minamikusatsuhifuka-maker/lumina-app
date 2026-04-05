import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { v4 as uuidv4 } from 'uuid';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const { staffId, answers } = body;
  if (!staffId || !answers) return NextResponse.json({ error: 'staffId と answers は必須です' }, { status: 400 });

  const sql = neon(process.env.DATABASE_URL!);

  // 試験データを取得
  const examRows = await sql`SELECT * FROM exams WHERE id = ${id}`;
  if (!examRows[0]) return NextResponse.json({ error: '試験が見つかりません' }, { status: 404 });

  const exam = examRows[0];
  const questions = typeof exam.questions === 'string' ? JSON.parse(exam.questions) : exam.questions;
  const passingScore = exam.passing_score || 70;

  // 自動採点: answersの各回答をquestionsのcorrectAnswerと比較
  let correctCount = 0;
  const totalQuestions = questions.length;

  for (const q of questions) {
    const userAnswer = answers[q.id];
    if (userAnswer && userAnswer === q.correctAnswer) {
      correctCount++;
    }
  }

  const score = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
  const passed = score >= passingScore;

  const resultId = uuidv4();
  await sql`INSERT INTO staff_exam_results (id, exam_id, staff_id, answers, score, passed)
    VALUES (${resultId}, ${id}, ${staffId}, ${JSON.stringify(answers)}, ${score}, ${passed})`;

  return NextResponse.json({
    success: true,
    id: resultId,
    score,
    passed,
    correctCount,
    totalQuestions,
  });
}
