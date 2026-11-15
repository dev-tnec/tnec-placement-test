// Small self-check for the rules that must not drift:
// question integrity, the level boundaries, and the answer key staying server side.
import assert from "node:assert/strict";
import {
  QUESTIONS,
  TOTAL_QUESTIONS,
  publicQuestions,
} from "../src/questions.js";
import { levelForScore } from "../src/levels.js";
import { buildResultEmail } from "../src/email.js";

assert.equal(TOTAL_QUESTIONS, 25);

for (const question of QUESTIONS) {
  assert.deepEqual(Object.keys(question.options), ["A", "B", "C", "D"]);
  assert.ok(question.options[question.answer], `Q${question.id} has no answer`);
}

const publicPayload = JSON.stringify(publicQuestions());
assert.equal(publicPayload.includes('"answer"'), false);

const boundaries = [
  [0, "starter"],
  [5, "starter"],
  [6, "basic"],
  [10, "basic"],
  [11, "intermediate"],
  [15, "intermediate"],
  [16, "advanced"],
  [19, "advanced"],
  [20, "toefl-prep"],
  [23, "toefl-prep"],
  [24, "toefl-scoring"],
  [25, "toefl-scoring"],
];

for (const [score, key] of boundaries) {
  assert.equal(levelForScore(score).key, key, `score ${score}`);
}

const email = buildResultEmail({
  name: "<script>alert(1)</script>",
  email: "test@example.com",
  score: 18,
  total: 25,
  level: levelForScore(18),
});
assert.equal(email.html.includes("<script>"), false);
assert.ok(email.subject.includes("Advanced"));

console.log("smoke ok");
