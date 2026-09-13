/* writeline.d.ts — types for the engine, so a TypeScript front end gets
 * autocomplete and compile-time errors instead of `any`.
 *
 * Hand-written rather than generated: the engine is plain JavaScript on purpose
 * (no build step, so the application still opens in a browser in ten years) and
 * these declarations are the seam where that meets a typed front end.
 */

export type Severity = 'error' | 'warn' | 'info';
export type SeverityLabel = 'Critical' | 'Moderate' | 'Note';
export type Canon = 'canon' | 'provisional' | 'suggested' | 'rejected';
export type SceneStatus = 'blank' | 'outlined' | 'drafted' | 'revised' | 'locked';

export interface Finding {
  id: string;
  /** Machine-readable rule name, e.g. "reader-forgot". Stable; use for logic. */
  rule: string;
  /** Display form of the rule, e.g. "Reader Forgot". */
  type: string;
  severity: Severity;
  label: SeverityLabel;
  /** The finding itself, already written as a sentence for the author. */
  description: string;
  /** What this rule catches in general. */
  explain: string;
  recordId: string | null;
  /** Which section of the app this finding belongs to. */
  view: string;
  chapter: string | null;
  chapterTitle?: string | null;
  scene: string | null;
  sceneTitle?: string | null;
}

export interface Stage {
  n: number;
  name: string;
  view: string;
  state: 'done' | 'partial' | 'todo' | 'pending';
  detail: string;
}

export interface PaceReport {
  verdict: 'none' | 'done' | 'passed' | 'impossible' | 'unknown' | 'ahead' | 'on-track' | 'behind';
  message: string;
  words: number;
  target: number;
  wordsLeft: number;
  daysLeft?: number;
  writingDaysLeft?: number;
  requiredPerDay?: number;
  projectedDays?: number;
}

export interface ReaderEntry {
  id: string;
  label: string;
  weight: number;
  /** 1 = just reminded, 0 = long forgotten. Below 0.35 the reader has lost it. */
  strength: number;
  scenesSince: number;
}

export interface ReaderState {
  at: number;
  /** Questions opened and not yet answered — this is the tension. */
  open: ReaderEntry[];
  known: ReaderEntry[];
  /** Told once, long enough ago that the reader no longer has it. */
  fading: ReaderEntry[];
  wrong: ReaderEntry[];
  met: { entityId: string; since: number; strength: number }[];
  tension: number;
}

export interface CurvePoint {
  i: number;
  tension: number;
  opened: number;
  closed: number;
  scene: { id: string; title: string };
}

export interface StyleMetrics { [metric: string]: number }

export interface DriftRow {
  key: string;
  label: string;
  unit: string;
  value: number;
  target: number;
  drift: number;
  off: boolean;
  /** Plain-English sentence a writer can act on. */
  text: string;
}

export interface SearchHit {
  id: string;
  type: string;
  kind: string;
  icon: string;
  view: string;
  title: string;
  score: number;
  snippet: { text: string; hit: boolean }[];
}

export interface Writeline {
  load(): Promise<Writeline>;
  subscribe(fn: () => void): () => void;

  projects(): any[];
  books(projectId: string): any[];
  open(projectId: string, bookId: string): void;
  current(): { projectId: string; bookId: string; project: any; book: any };

  get(id: string): any;
  list(type: string): any[];
  create(type: string, fields?: object): Promise<any>;
  patch(id: string, fields: object): Promise<any>;
  remove(id: string): Promise<void>;
  chapters(bookId: string): any[];
  scenes(chapterId: string): any[];
  bookScenes(bookId: string): any[];
  entities(bookId: string, kind?: string): any[];

  /** Computed on every call. Never cache these into component state. */
  findings(bookId?: string): Finding[];
  findingCounts(bookId?: string): Record<SeverityLabel, number>;
  pipeline(bookId?: string): { stages: Stage[]; progress: number; next: Stage | null };
  pace(bookId?: string): PaceReport;
  stats(bookId?: string): Record<string, number>;
  reader(bookId?: string, at?: number | null):
    { sceneCount: number; at: number; curve: CurvePoint[]; state: ReaderState | null };

  style: {
    measure(text: string): StyleMetrics | null;
    blend(entries: { metrics: StyleMetrics | null; weight: number }[]): StyleMetrics | null;
    drift(bookId?: string, target?: StyleMetrics): DriftRow[];
  };

  search(query: string): SearchHit[];
  importFile(file: File): Promise<string>;
  detectStructure(text: string): {
    strategy: string; chapterCount: number; sceneCount: number; words: number;
    chapters: { title: string; scenes: { title: string; prose: string }[] }[];
  };

  wordCount(text: string): number;
}

export function createWriteline(): Writeline;
export const writeline: Writeline;
