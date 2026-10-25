/**
 * Page ranges as people type them, e.g. "1-170, 175, 200-end".
 * Pages are 1-based in the text and 0-based in the returned indices.
 */

export type PageRange = { from: number; to: number };

export type ParsedRanges =
  | { ok: true; ranges: PageRange[]; indices: number[] }
  | { ok: false; error: string };

/** Parses a range list. An empty string means every page. */
export function parsePageRanges(text: string, pageCount: number): ParsedRanges {
  const trimmed = text.trim();
  if (!trimmed || /^all$/i.test(trimmed)) {
    return {
      ok: true,
      ranges: [{ from: 1, to: pageCount }],
      indices: Array.from({ length: pageCount }, (_, i) => i),
    };
  }

  const ranges: PageRange[] = [];
  for (const raw of trimmed.split(/[,;]+/)) {
    const part = raw.trim();
    if (!part) continue;
    const match =
      /^(\d+|end|last)\s*(?:[-–—]|to)\s*(\d+|end|last)$/i.exec(part) ??
      /^(\d+|end|last)$/i.exec(part);
    if (!match) return { ok: false, error: `"${part}" is not a page or range (e.g. 1-170)` };
    const page = (value: string) => (/^(end|last)$/i.test(value) ? pageCount : Number(value));
    const from = page(match[1]);
    const to = match[2] ? page(match[2]) : from;
    if (from < 1 || to < 1) return { ok: false, error: 'Pages start at 1' };
    if (from > pageCount || to > pageCount) {
      return { ok: false, error: `This PDF has ${pageCount} pages` };
    }
    if (from > to) return { ok: false, error: `"${part}" goes backwards; use ${to}-${from}` };
    ranges.push({ from, to });
  }
  if (ranges.length === 0) return { ok: false, error: 'Enter pages, e.g. 1-170' };

  const indices: number[] = [];
  for (const { from, to } of ranges) for (let p = from; p <= to; p++) indices.push(p - 1);
  return { ok: true, ranges, indices };
}

export function formatRange({ from, to }: PageRange) {
  return from === to ? `${from}` : `${from}-${to}`;
}

/** Ranges of `size` pages each: 1-10, 11-20, ... */
export function everyNPages(pageCount: number, size: number): PageRange[] {
  const ranges: PageRange[] = [];
  for (let from = 1; from <= pageCount; from += size) {
    ranges.push({ from, to: Math.min(pageCount, from + size - 1) });
  }
  return ranges;
}
