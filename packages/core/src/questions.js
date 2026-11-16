// The answer key lives here and is never sent to the browser.
// Source: placement-test-questions.md (JotForm 252018413812044).

export const QUESTIONS = [
  {
    id: 1,
    prompt: "What is the opposite of \u201ccold\u201d?",
    options: { A: "Hot", B: "Warm", C: "Heat", D: "Ice" },
    answer: "A",
  },
  {
    id: 2,
    prompt: "That notebook isn\u2019t mine, it\u2019s ___ .",
    options: { A: "his", B: "him", C: "her", D: "our" },
    answer: "A",
  },
  {
    id: 3,
    prompt: "Yesterday she ___ to the market.",
    options: { A: "go", B: "goes", C: "went", D: "going" },
    answer: "C",
  },
  {
    id: 4,
    prompt: "___ many siblings?",
    options: {
      A: "Do Cindy has",
      B: "Do Cindy have",
      C: "Does Cindy has",
      D: "Does Cindy have",
    },
    answer: "D",
  },
  {
    id: 5,
    prompt: "Doctors say that regular exercise is important for your ______.",
    options: { A: "health", B: "healthy", C: "healthier", D: "healthiest" },
    answer: "A",
  },
  {
    id: 6,
    prompt: "They _______ each other since high school.",
    options: { A: "know", B: "knew", C: "known", D: "have known" },
    answer: "D",
  },
  {
    id: 7,
    prompt: "How do you say this time? 5:30",
    options: {
      A: "Half past five",
      B: "Half past six",
      C: "Five o'clock",
      D: "Thirty five",
    },
    answer: "A",
  },
  {
    id: 8,
    prompt:
      "Few policies that aim to reduce inequality through education reform ___ produced measurable results in the short term.",
    options: { A: "has", B: "have", C: "had", D: "having" },
    answer: "B",
  },
  {
    id: 9,
    prompt: "They are __________ their school uniforms today.",
    options: { A: "wear", B: "wearing", C: "wears", D: "wore" },
    answer: "B",
  },
  {
    id: 10,
    prompt: "The opposite of \u201crare\u201d is\u2026?",
    options: { A: "Common", B: "Scarce", C: "Precious", D: "Expensive" },
    answer: "A",
  },
  {
    id: 11,
    prompt:
      "The documentary included several chapters about history and identity. The one that discussed how governments shape what people remember was called __________ .",
    options: {
      A: "The Politics of Memory",
      B: "History and Identity",
      C: "Culture and Society",
      D: "Writing the Past",
    },
    answer: "A",
  },
  {
    id: 12,
    prompt: "Which sentence is correct?",
    options: {
      A: "I suggest going to the library.",
      B: "I suggest to go to the library.",
      C: "I suggest go to the library.",
      D: "I suggest went to the library.",
    },
    answer: "A",
  },
  {
    id: 13,
    prompt: "I'm really looking forward ________ my holiday.",
    options: { A: "to", B: "at", C: "in", D: "for" },
    answer: "A",
  },
  {
    id: 14,
    passage:
      "Recent scholarship has reexamined the notion of presence in digital communication. Far from merely indicating physical availability, presence has been theorized as a condition of mutual awareness sustained through mediated cues, typing indicators, profile icons, and read receipts. In this sense, presence operates less as a spatial fact than as a performative claim to attention.",
    prompt: "In this paragraph, the word presence most nearly refers to:",
    options: {
      A: "The physical state of being located somewhere",
      B: "The impression of being perceived by others",
      C: "The technological ability to transmit messages instantly",
      D: "The social norm of politeness in digital interaction",
    },
    answer: "B",
  },
  {
    id: 15,
    prompt: "Despite ___ very tired, he finished the project.",
    options: { A: "be", B: "being", C: "to be", D: "been" },
    answer: "B",
  },
  {
    id: 16,
    prompt: "The results were significantly ___ by unexpected errors.",
    options: { A: "influenced", B: "compared", C: "eliminated", D: "described" },
    answer: "A",
  },
  {
    id: 17,
    prompt:
      "The number of international students in the program ___ increased significantly this year",
    options: { A: "have", B: "has", C: "are", D: "were" },
    answer: "B",
  },
  {
    id: 18,
    prompt: "Which sentence is correct?",
    options: {
      A: "The book which I borrowed yesterday is interesting.",
      B: "The book I borrowed yesterday interesting is.",
      C: "The book I borrowed yesterday it is interesting.",
      D: "The book I borrowed yesterday are interesting.",
    },
    answer: "A",
  },
  {
    id: 19,
    prompt: "Choose the correct sentence:",
    options: {
      A: "I wish I know the answer.",
      B: "I wish I knew the answer.",
      C: "I wish I knowing the answer.",
      D: "I wish I known the answer.",
    },
    answer: "B",
  },
  {
    id: 20,
    prompt: "Hardly ___ the train when it started to rain.",
    options: {
      A: "he left",
      B: "did he leave",
      C: "he had left",
      D: "had he left",
    },
    answer: "D",
  },
  {
    id: 21,
    prompt: "Yesterday, what __________ about the new rules?",
    options: {
      A: "do we know",
      B: "did we know",
      C: "we know",
      D: "we did know",
    },
    answer: "B",
  },
  {
    id: 22,
    prompt: "The professor explained ___ the theory in detail.",
    options: { A: "us", B: "to us", C: "we", D: "ours" },
    answer: "B",
  },
  {
    id: 23,
    prompt: "\u201cDiminish\u201d most nearly means?",
    options: { A: "Increase", B: "Reduce", C: "Expand", D: "Improve" },
    answer: "B",
  },
  {
    id: 24,
    prompt: "Ms. Jayden works ___ the museum ___ the city center.",
    options: { A: "in, at", B: "at, in", C: "in, on", D: "on, in" },
    answer: "B",
  },
  {
    id: 25,
    prompt:
      "The process, which many scholars ___ as gradual rather than sudden, continues to shape economic development in the region.",
    options: {
      A: "describe",
      B: "described",
      C: "describing",
      D: "have described",
    },
    answer: "B",
  },
];

export const TOTAL_QUESTIONS = QUESTIONS.length;

// Public shape: no answer key.
export function publicQuestions() {
  return QUESTIONS.map(({ id, prompt, passage, options }) => ({
    id,
    prompt,
    ...(passage ? { passage } : {}),
    options,
  }));
}
