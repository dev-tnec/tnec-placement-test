// Markdown-lite for question passages, shared by the student renderer and the dashboard
// preview so a passage always renders the same on both sides. The format is plain text:
// <b> <i> <u> inline tags, "- " bullet lines, "1. " numbered lines, and a blank line
// between paragraphs. React builds the elements from these blocks, so nothing ever goes
// through innerHTML, and any tag this parser does not know stays literal text.

const INLINE = /<(b|i|u)>([\s\S]*?)<\/\1>/;
const BULLET = /^[-•]\s+/;
const NUMBERED = /^\d+[.)]\s+/;

/** One line into styled runs. An unmatched tag stays part of the plain text. */
function inlineRuns(line) {
  const runs = [];
  let at = 0;
  for (const found of line.matchAll(new RegExp(INLINE.source, "g"))) {
    if (found.index > at) runs.push({ text: line.slice(at, found.index) });
    if (found[2]) runs.push({ text: found[2], [found[1]]: true });
    at = found.index + found[0].length;
  }
  if (at < line.length) runs.push({ text: line.slice(at) });
  return runs;
}

/**
 * A passage becomes blocks: paragraphs ({ type: "p", lines: [runs] }) where a blank line
 * starts a new paragraph, or one list ({ type: "ul" | "ol", items: [runs] }) when every
 * line of the block carries the same list marker. A block with mixed markers stays a
 * paragraph and keeps its markers as literal text.
 */
export function parseRichText(text) {
  const source = String(text ?? "").replace(/\r\n/g, "\n").trim();
  if (!source) return [];
  return source.split(/\n\s*\n+/).map((block) => {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    if (lines.every((line) => BULLET.test(line))) {
      return { type: "ul", items: lines.map((line) => inlineRuns(line.replace(BULLET, ""))) };
    }
    if (lines.every((line) => NUMBERED.test(line))) {
      return { type: "ol", items: lines.map((line) => inlineRuns(line.replace(NUMBERED, ""))) };
    }
    return { type: "p", lines: lines.map(inlineRuns) };
  });
}
