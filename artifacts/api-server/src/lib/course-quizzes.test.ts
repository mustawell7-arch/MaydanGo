import assert from "node:assert/strict";
import test from "node:test";
import { gradeCourseQuiz, validateCourseQuizDraft } from "./course-quizzes";

const translated = (en: string) => ({ en, ar: `ع ${en}`, ku: `ک ${en}` });
const validDraft = {
  passingScorePercent: 70,
  questions: [{
    prompt: translated("Which option is safe?"),
    options: [translated("Ignore pain"), translated("Stop when sharp pain occurs")],
    correctOptionIndex: 1,
    explanation: null,
  }],
};

test("course quiz grading returns score, pass state, and feedback after submission", () => {
  const quiz = validateCourseQuizDraft(validDraft);
  assert.ok(quiz);
  assert.deepEqual(gradeCourseQuiz(quiz, [1]), {
    scorePercent: 100,
    passed: true,
    questionResults: [{
      selectedOptionIndex: 1,
      correctOptionIndex: 1,
      correct: true,
      explanation: null,
    }],
  });
  assert.equal(gradeCourseQuiz(quiz, [0]).passed, false);
});

test("course quiz validation rejects untranslated or impossible answer keys", () => {
  assert.throws(() => validateCourseQuizDraft({
    ...validDraft,
    questions: [{ ...validDraft.questions[0], correctOptionIndex: 2 }],
  }));
  assert.throws(() => validateCourseQuizDraft({
    ...validDraft,
    questions: [{ ...validDraft.questions[0], prompt: { en: "Question", ar: "", ku: "پرسیار" } }],
  }));
  const quiz = validateCourseQuizDraft(validDraft);
  assert.ok(quiz);
  assert.throws(() => gradeCourseQuiz(quiz, []));
});
