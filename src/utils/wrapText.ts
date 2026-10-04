/**
 * Greedy word-wrap shared by the on-screen text overlay (canvas metrics) and
 * the PDF exporter (pdf-lib font metrics) so line breaks match between the
 * editor and the exported file.
 *
 * Splits on newlines first, wraps words to maxWidth, and hard-breaks words
 * that are wider than the box. Always returns at least one line.
 */
export function wrapLines(
  measure: (text: string) => number,
  text: string,
  maxWidth: number,
): string[] {
  const limit = Math.max(1, maxWidth);
  const lines: string[] = [];

  const breakWord = (word: string): string[] => {
    const chunks: string[] = [];
    let chunk = '';
    for (const ch of word) {
      if (chunk && measure(chunk + ch) > limit) {
        chunks.push(chunk);
        chunk = ch;
      } else {
        chunk += ch;
      }
    }
    if (chunk) chunks.push(chunk);
    return chunks;
  };

  for (const para of text.split('\n')) {
    if (!para.trim()) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of para.trim().split(/\s+/)) {
      if (measure(word) > limit) {
        // Word alone is wider than the box: flush the current line and
        // hard-break the word across as many lines as needed.
        if (line) {
          lines.push(line);
          line = '';
        }
        const chunks = breakWord(word);
        const last = chunks.pop();
        lines.push(...chunks);
        line = last ?? '';
        continue;
      }
      const candidate = line ? line + ' ' + word : word;
      if (measure(candidate) <= limit) {
        line = candidate;
      } else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }

  return lines.length ? lines : [''];
}
