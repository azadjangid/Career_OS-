export interface DiffLine {
  type: 'same' | 'added' | 'removed';
  text: string;
}

/**
 * Line-level diff (longest common subsequence) between two resume texts. Blank lines and
 * surrounding whitespace are ignored so re-exported files don't show up as changed everywhere.
 * Inputs are capped at 1,500 lines each, far above any real resume.
 */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = clean(before);
  const b = clean(after);
  const n = a.length;
  const m = b.length;
  // dp[i][j] = LCS length of a[i..] and b[j..]
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ type: 'same', text: a[i]! }); i++; j++; }
    else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) out.push({ type: 'removed', text: a[i++]! });
    else out.push({ type: 'added', text: b[j++]! });
  }
  while (i < n) out.push({ type: 'removed', text: a[i++]! });
  while (j < m) out.push({ type: 'added', text: b[j++]! });
  return out;
}

const clean = (s: string) => (s ?? '').replace(/\r/g, '').split('\n').map(l => l.trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 1500);

export function diffStats(d: DiffLine[]) {
  return { added: d.filter(l => l.type === 'added').length, removed: d.filter(l => l.type === 'removed').length, unchanged: d.filter(l => l.type === 'same').length };
}
