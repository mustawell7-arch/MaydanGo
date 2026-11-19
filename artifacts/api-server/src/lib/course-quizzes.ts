import type { CourseQuiz, CourseQuizQuestion, LocalizedText } from "@workspace/db";

function isLocalizedText(value: unknown, maxLength: number): value is LocalizedText {
  if (!value || typeof value !== "object") return false;
  const localized = value as Record<string, unknown>;
  return ["en", "ar", "ku"].every(language =>
    typeof localized[language] === "string"
    && localized[language].trim().length > 0
    && localized[language].length <= maxLength,
  );
}

export function validateCourseQuizDraft(value: unknown): CourseQuiz | null {
  if (value == null) return null;
  if (!value || typeof value !== "object") throw new Error("Quiz content must be an object.");
  const quiz = value as Record<string, unknown>;
  const questions = quiz.questions;
  const passingScorePercent = quiz.passingScorePercent;
  if (
    !Number.isInteger(passingScorePercent) || Number(passingScorePercent) < 1 || Number(passingScorePercent) > 100
    || !Array.isArray(questions) || questions.length < 1 || questions.length > 25
  ) {
    throw new Error("A quiz needs 1–25 questions and a passing score from 1–100.");
  }
  const validatedQuestions: CourseQuizQuestion[] = questions.map((rawQuestion, questionIndex) => {
    if (!rawQuestion || typeof rawQuestion !== "object") {
      throw new Error(`Quiz question ${questionIndex + 1} is invalid.`);
    }
    const question = rawQuestion as Record<string, unknown>;
    const options = question.options;
    const correctOptionIndex = question.correctOptionIndex;
    if (
      !isLocalizedText(question.prompt, 2000)
      || !Array.isArray(options)
      || options.length < 2
      || options.length > 6
      || !options.every(option => isLocalizedText(option, 240))
      || !Number.isInteger(correctOptionIndex)
      || Number(correctOptionIndex) < 0
      || Number(correctOptionIndex) >= options.length
      || (question.explanation !== null && !isLocalizedText(question.explanation, 2000))
    ) {
      throw new Error(`Quiz question ${questionIndex + 1} needs a translated prompt, 2–6 translated answers, one correct answer, and a translated explanation or none.`);
    }
    return {
      prompt: question.prompt,
      options,
      correctOptionIndex: Number(correctOptionIndex),
      explanation: question.explanation as LocalizedText | null,
    };
  });
  return {
    passingScorePercent: Number(passingScorePercent),
    questions: validatedQuestions,
  };
}

export function gradeCourseQuiz(quiz: CourseQuiz, answers: number[]) {
  if (answers.length !== quiz.questions.length) {
    throw new Error("Answer every question before submitting.");
  }
  const questionResults = quiz.questions.map((question, index) => {
    const selectedOptionIndex = answers[index];
    if (!Number.isInteger(selectedOptionIndex) || selectedOptionIndex < 0 || selectedOptionIndex >= question.options.length) {
      throw new Error(`Choose a valid answer for question ${index + 1}.`);
    }
    return {
      selectedOptionIndex,
      correctOptionIndex: question.correctOptionIndex,
      correct: selectedOptionIndex === question.correctOptionIndex,
      explanation: question.explanation,
    };
  });
  const correctCount = questionResults.filter(result => result.correct).length;
  const scorePercent = Math.round((correctCount / questionResults.length) * 100);
  return {
    scorePercent,
    passed: scorePercent >= quiz.passingScorePercent,
    questionResults,
  };
}
