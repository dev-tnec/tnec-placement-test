// Markdown-lite for question passages, shared by the student renderer and the dashboard
// preview so a passage always renders the same on both sides. The format is plain text:
// <b> <i> <u> inline tags, "- " bullet lines, "1. " numbered lines, "> " quote lines,
// "| a | b |" table lines, ![alt](/path.png) images, and a blank line between paragraphs.
// React builds the elements from these blocks, so nothing ever goes through innerHTML,
// and any syntax this parser does not know stays literal text. Images only resolve for
// paths hosted on the test site itself, which is all the CSP allows anyway.

const TAG = /<(b|i|u)>([\s\S]*?)<\/\1>/;
const IMAGE = /!\[([^\]]*)\]\((\/[^\s)]*)\)/g;
const BULLET = /^[-•]\s+/;
const NUMBERED = /^\d+[.)]\s+/;
const QUOTE = /^>\s?/;
const SEP_CELL = /^:?-{3,}:?$/;

/** One text chunk into styled runs. An unmatched tag stays part of the plain text. */
function tagRuns(text) {
  const runs = [];
  let at = 0;
  for (const found of text.matchAll(new RegExp(TAG.source, "g"))) {
    if (found.index > at) runs.push({ text: text.slice(at, found.index) });
    if (found[2]) runs.push({ text: found[2], [found[1]]: true });
    at = found.index + found[0].length;
  }
  if (at < text.length) runs.push({ text: text.slice(at) });
  return runs;
}

/** One line into styled runs and image runs. An image with a foreign address stays literal. */
function inlineRuns(line) {
  let at = 0;
  const runs = [];
  for (const found of line.matchAll(IMAGE)) {
    if (found.index > at) runs.push(...tagRuns(line.slice(at, found.index)));
    runs.push({ image: found[2], alt: found[1] });
    at = found.index + found[0].length;
  }
  if (at === 0) return tagRuns(line);
  if (at < line.length) runs.push(...tagRuns(line.slice(at)));
  return runs;
}

/** One table line into cells, dropping the pipes that open and close the line. */
function tableCells(line) {
  const cells = line.split("|").map((cell) => cell.trim());
  if (cells[0] === "") cells.shift();
  if (cells[cells.length - 1] === "") cells.pop();
  return cells;
}

/**
 * A passage becomes blocks: paragraphs ({ type: "p", lines: [runs] }) where a blank line
 * starts a new paragraph, a quote ({ type: "quote", lines: [runs] }), a list
 * ({ type: "ul" | "ol", items: [runs] }), or a table ({ type: "table", header, rows }) with
 * the header taken from the separator row markdown uses. A block whose lines do not all
 * carry the same marker stays a paragraph and keeps its markers as literal text.
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
    if (lines.every((line) => QUOTE.test(line))) {
      return { type: "quote", lines: lines.map((line) => inlineRuns(line.replace(QUOTE, ""))) };
    }
    if (lines.length > 1 && lines.every((line) => line.includes("|"))) {
      const isSep = (row) => row.length && row.every((cell) => SEP_CELL.test(cell));
      const rows = lines.map(tableCells);
      const hasHeader = rows.length > 2 && isSep(rows[1]);
      return {
        type: "table",
        header: hasHeader ? rows[0].map(inlineRuns) : null,
        rows: (hasHeader ? rows.slice(2) : rows).filter((row) => !isSep(row)).map((row) => row.map(inlineRuns)),
      };
    }
    return { type: "p", lines: lines.map(inlineRuns) };
  });
}
