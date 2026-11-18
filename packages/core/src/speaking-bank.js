// The placement speaking bank: which questions a student gets. Pure, no I/O, so the smoke
// test checks the rule directly.
//
// The rule, as the owner set it: the bank order is the position order. One question means
// always the first. More than one with randomize on means a random pick of that many; without
// randomize the first questions in order. A count larger than the bank takes the whole bank.

export function pickSpeakingQuestions(bank, { count, randomize } = {}) {
  const active = (Array.isArray(bank) ? bank : [])
    .filter((q) => q && q.status === "aktif" && q.prompt)
    .slice()
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const wanted = Math.max(1, Number(count) || 1);
  const n = Math.min(wanted, active.length);
  if (n <= 1) return active.slice(0, 1);
  if (!randomize) return active.slice(0, n);
  const pool = [...active];
  const picked = [];
  while (picked.length < n && pool.length) {
    picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  // The student sees the questions in bank order, whatever order they were drawn in.
  return picked.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}
