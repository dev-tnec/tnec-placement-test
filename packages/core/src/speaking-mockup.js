// The IELTS mockup speaking interview: three parts, examiner videos, and the per-question
// timing. The videos are the examiner asking, hosted under apps/web/public/video/speaking.
// Each answer is recorded separately and scored by Speechace; the speaking band comes from the
// four IELTS criteria averaged across the answers.

export const MOCKUP_SPEAKING_PARTS = [
  {
    part: 1,
    title: "Part 1: Introduction and interview",
    instruction: "Answer the examiner's questions about yourself.",
    prepSeconds: 0,
    speakSeconds: 25,
    questions: [
      { no: 1, text: "What is your full name?", video: "/video/speaking/p1-name.mp4" },
      { no: 2, text: "Where are you from?", video: "/video/speaking/p1-where.mp4" },
      { no: 3, text: "Do you work or study?", video: "/video/speaking/p1-work.mp4" },
      { no: 4, text: "What do you usually do at weekends? What did you do last weekend?", video: "/video/speaking/p1-weekend-activities.mp4" },
      { no: 5, text: "Do you like weekends?", video: "/video/speaking/p1-weekend-like.mp4" },
      { no: 6, text: "Do you think it is important to make the most of your weekend?", video: "/video/speaking/p1-weekend-important.mp4" },
      { no: 7, text: "Is it important to study stars?", video: "/video/speaking/p1-stars-important.mp4" },
      { no: 8, text: "What is your favourite star?", video: "/video/speaking/p1-stars-favourite.mp4" },
      { no: 9, text: "Do you think geography is useful?", video: "/video/speaking/p1-geography-useful.mp4" },
      { no: 10, text: "Have you ever learned geography?", video: "/video/speaking/p1-geography-learned.mp4" },
      { no: 11, text: "Do you want to be a geography teacher?", video: "/video/speaking/p1-geography-teacher.mp4" },
    ],
  },
  {
    part: 2,
    title: "Part 2: Long turn",
    instruction: "You have 60 seconds to prepare. Then speak for up to 2 minutes.",
    prepSeconds: 60,
    speakSeconds: 120,
    cue: [
      "Describe a difficult task that you completed at work or study that you felt proud of.",
      "You should say:",
      "what the task was",
      "how you completed it",
      "why the task was difficult",
      "and why you were proud of completing the task.",
    ],
    questions: [
      {
        no: 1,
        text: "Describe a difficult task that you completed at work or study that you felt proud of.",
        video: "/video/speaking/p2-difficult-task.mp4",
      },
    ],
  },
  {
    part: 3,
    title: "Part 3: Discussion",
    instruction: "Answer the examiner's questions in more detail.",
    prepSeconds: 0,
    speakSeconds: 30,
    questions: [
      { no: 1, text: "What are the things that make people feel proud?", video: "/video/speaking/p3-proud-things.mp4" },
      { no: 2, text: "Do people often feel proud of themselves?", video: "/video/speaking/p3-proud-people.mp4" },
      { no: 3, text: "What challenges do young people face today?", video: "/video/speaking/p3-young-challenges.mp4" },
      { no: 4, text: "How do young people handle difficult or challenging situations?", video: "/video/speaking/p3-young-handle.mp4" },
      { no: 5, text: "What kinds of rewards do people receive for their work?", video: "/video/speaking/p3-rewards.mp4" },
      { no: 6, text: "What are the most difficult jobs that people do?", video: "/video/speaking/p3-difficult-jobs.mp4" },
    ],
  },
];

export const MOCKUP_SPEAKING_TOTAL = MOCKUP_SPEAKING_PARTS.reduce((sum, part) => sum + part.questions.length, 0);

/** The public shape for the attempt response: no answers, only the questions and the videos. */
export function mockupSpeakingPlan() {
  return {
    total: MOCKUP_SPEAKING_TOTAL,
    parts: MOCKUP_SPEAKING_PARTS.map((part) => ({
      part: part.part,
      title: part.title,
      instruction: part.instruction,
      prepSeconds: part.prepSeconds,
      speakSeconds: part.speakSeconds,
      ...(part.cue ? { cue: part.cue } : {}),
      questions: part.questions.map((q) => ({ no: q.no, text: q.text, video: q.video })),
    })),
  };
}

export function mockupSpeakingQuestion(partNumber, questionNumber) {
  const part = MOCKUP_SPEAKING_PARTS.find((p) => p.part === Number(partNumber));
  if (!part) return null;
  const question = part.questions.find((q) => q.no === Number(questionNumber));
  if (!question) return null;
  return { part, question };
}

/** The four IELTS criteria from the mapped Speechace scores (scores.aspects[key].ielts). */
export function speakingCriteria(scores) {
  const aspect = (key) => {
    const value = Number(scores?.aspects?.[key]?.ielts);
    return Number.isFinite(value) ? value : null;
  };
  const pronunciation = aspect("pronunciation");
  const fluency = aspect("fluency");
  const coherence = aspect("coherence");
  const lexical = aspect("vocab");
  const grammar = aspect("grammar");
  return {
    pronunciation,
    fluency_coherence: fluency !== null && coherence !== null ? (fluency + coherence) / 2 : fluency ?? coherence,
    lexical_resource: lexical,
    grammatical_range_accuracy: grammar,
  };
}

/** The speaking band: the mean of the four criteria, rounded to the nearest half. */
export function speakingBandFromCriteria(criteria) {
  const values = [criteria.pronunciation, criteria.fluency_coherence, criteria.lexical_resource, criteria.grammatical_range_accuracy]
    .filter((v) => Number.isFinite(v));
  if (!values.length) return 0;
  return Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 2) / 2;
}
