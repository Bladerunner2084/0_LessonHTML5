/* model.js — the single source of truth.
 *
 * Design note: the nine "documents" in a novel project are not nine files.
 * Four of them (Timeline, Revelation Map, Chapter Map, Scene Map) are
 * projections over a shared record set. Write a fact once, see it everywhere.
 *
 * Record types:
 *   project     a novel or a series
 *   book        one volume inside a project (a standalone novel has exactly one)
 *   entity      character / location / faction / item / concept  -> feeds the Bibles
 *   beat        one dated thing that happens in story time       -> feeds the Timeline
 *   revelation  one fact + who knows it + when the reader learns -> Revelation Map
 *   chapter     ordered container                                -> Chapter Map
 *   scene       the atomic unit: prose lives here                -> Scene Map, Manuscript
 *   note        freeform text (Draft 0, loose story-bible pages)
 */

export const RECORD_TYPES = [
  'project', 'book', 'entity', 'beat', 'revelation', 'chapter', 'scene', 'note',
  'decision', 'question', 'idea', 'version', 'wordlog', 'submission',
];

/* PRD §35/§36 — the three routes out of a finished manuscript. The platform
 * carries the author to the door of each and is honest that it cannot walk
 * through it for them. */
export const PATHWAYS = {
  traditional: {
    label: 'Traditional',
    blurb: 'Agent, then publisher. Slowest, highest reach, you keep the least.',
  },
  self: {
    label: 'Self-publishing',
    blurb: 'You are the publisher. Fastest, full control, every cost is yours.',
  },
  assisted: {
    label: 'AI-assisted',
    blurb: 'Tooling handles production and distribution. Fast, cheap, and the '
      + 'quality floor is entirely your own editorial discipline.',
  },
  /* Print-on-demand sold from the author's own storefront. The highest margin
   * per copy by a wide margin, and the only route where the author is also the
   * retailer — which is a legal position, not just a technical one. */
  direct: {
    label: 'Direct to reader',
    blurb: 'Your storefront, print-on-demand fulfilment, money to your own bank. '
      + 'Best margin per copy, and you become the merchant — tax, returns and '
      + 'support included.',
  },
};

/* PRD §34 — canon status, and §2's author-confirmed / AI-inferred / unresolved
 * distinction, are the same axis, so they are one field rather than two.
 * It lives on the base record because a system that cannot tell an AI guess
 * from an author's decision will eventually launder one into the other, and
 * that is the specific failure this whole platform exists to prevent. */
export const CANON = {
  canon:       { label: 'Canon',         mark: '🟢', blurb: 'The author established this.' },
  provisional: { label: 'Provisional',   mark: '🟡', blurb: 'Working assumption. Not settled.' },
  suggested:   { label: 'AI suggestion', mark: '🔵', blurb: 'Proposed by AI. Not yet author-approved.' },
  rejected:    { label: 'Non-canon',     mark: '🔴', blurb: 'Considered and rejected. Kept as a record.' },
};

export const CANON_ORDER = ['canon', 'provisional', 'suggested', 'rejected'];

export const ENTITY_KINDS = {
  character: { label: 'Character', bible: 'character', icon: '◈' },
  location:  { label: 'Location',  bible: 'world',     icon: '◉' },
  faction:   { label: 'Faction',   bible: 'world',     icon: '⬢' },
  item:      { label: 'Item',      bible: 'world',     icon: '◆' },
  concept:   { label: 'Concept',   bible: 'story',     icon: '◇' },
};

export const SCENE_STATUS = ['blank', 'outlined', 'drafted', 'revised', 'locked'];

/* PRD §5 — a revelation's state in the reader's mind is not binary. "Hinted"
 * and "misunderstood" are the two that carry most of the work in a thriller. */
export const REVELATION_STATUS = [
  'unknown', 'suspected', 'hinted', 'revealed', 'confirmed',
  'misunderstood', 'false', 'secret', 'classified', 'redacted',
];

/* PRD §4 — the Character Bible's prescribed fields. Presented as prompts the
 * author can delete, never as a form that must be completed. */
export const CHARACTER_FIELDS = [
  'Age', 'Birthplace', 'Occupation', 'Physical description', 'Personality',
  'Values', 'Beliefs', 'Fears', 'Desires', 'Internal conflict', 'External conflict',
  'Strengths', 'Weaknesses', 'Relationships', 'Secrets', 'Character arc',
  'Voice', 'Speech characteristics', 'Behavioral rules', 'Would NEVER do',
];

/* Beats that change whether an entity can legally appear in a later scene.
 * The continuity engine reads these; nothing else in the app cares. */
export const BEAT_KINDS = {
  event:  { label: 'Event',     gates: null },
  birth:  { label: 'Birth',     gates: 'enter' },
  death:  { label: 'Death',     gates: 'exit'  },
  exit:   { label: 'Departure', gates: 'exit'  },
  arrive: { label: 'Arrival',   gates: 'enter' },
};

let counter = 0;
export function uid(prefix = 'r') {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}`;
}

const now = () => new Date().toISOString();

function base(type, fields) {
  return {
    id: uid(type.slice(0, 3)),
    type,
    /* Anything a human creates in the UI is canon by default. Only the AI layer
     * may mint a record as 'suggested', and only the author may promote it. */
    canon: 'canon',
    createdAt: now(),
    updatedAt: now(),
    ...fields,
  };
}

export const make = {
  project: (f = {}) => base('project', {
    title: 'Untitled Project',
    kind: 'novel',          // 'novel' | 'series'
    logline: '',
    ...f,
  }),

  book: (f = {}) => base('book', {
    projectId: null,
    title: 'Book 1',
    order: 0,
    targetWords: 90000,
    /* A deadline is opt-in. Imposed by default it becomes ambient guilt, and a
     * writer who feels watched by their own software stops opening it. */
    deadlineOn: false,
    deadline: '',           // 'YYYY-MM-DD'
    writingDays: 7,         // days per week the author actually writes
    pathway: null,          // see PATHWAYS — chosen in Publication Mode
    pubChecks: {},          // checklist key -> true
    published: false,
    ...f,
  }),

  entity: (f = {}) => base('entity', {
    projectId: null,
    bookId: null,           // null = shared across every book in the project
    kind: 'character',
    name: 'Unnamed',
    aliases: [],
    summary: '',
    fields: {},             // freeform key/value: Want, Wound, Lie, Voice, ...
    notes: '',
    ...f,
  }),

  beat: (f = {}) => base('beat', {
    projectId: null,
    bookId: null,
    kind: 'event',
    label: 'Untitled beat',
    storyTime: '',          // human-readable: "Day 3, 04:12" or "2084-11-02"
    order: 0,               // authoritative chronological rank
    description: '',
    entityIds: [],
    sceneId: null,          // the scene that dramatizes this beat, if any
    ...f,
  }),

  revelation: (f = {}) => base('revelation', {
    projectId: null,
    bookId: null,
    label: 'Untitled revelation',
    fact: '',
    weight: 'minor',        // 'minor' | 'major' | 'twist'
    status: 'secret',       // see REVELATION_STATUS
    purpose: '',            // why this exists in the story
    consequences: '',       // what changes once it lands
    knownBy: [],            // [{ entityId, sinceBeatId }]
    plantedIn: [],          // sceneIds carrying setup
    revealedIn: null,       // sceneId where the READER learns it
    ...f,
  }),

  chapter: (f = {}) => base('chapter', {
    bookId: null,
    order: 0,
    title: 'Untitled chapter',
    summary: '',
    targetWords: 3000,
    ...f,
  }),

  scene: (f = {}) => base('scene', {
    bookId: null,
    chapterId: null,
    order: 0,
    title: 'Untitled scene',
    summary: '',
    status: 'blank',
    pov: null,              // entityId
    locationId: null,       // entityId
    presentIds: [],         // entityIds physically in the scene
    usesRevelationIds: [],  // revelations this scene leans on as already-known
    isFlashback: false,
    prose: '',
    ...f,
  }),

  /* PRD §27 — a locked decision is a constraint the AI layer must respect.
   * Storing the reason matters more than storing the decision: six months on,
   * the reason is the only thing that lets you judge whether to unlock it. */
  decision: (f = {}) => base('decision', {
    projectId: null,
    bookId: null,
    label: 'Untitled decision',
    rationale: '',
    status: 'locked',       // 'locked' | 'open' | 'unlocked'
    relatedIds: [],
    ...f,
  }),

  /* PRD §28 — questions the author has not answered, kept where they cannot
   * evaporate into a conversation. */
  question: (f = {}) => base('question', {
    projectId: null,
    bookId: null,
    text: '',
    answer: '',
    status: 'open',         // 'open' | 'answered'
    ...f,
  }),

  /* PRD §29 — raw, unstructured, deliberately unfiled. Creativity is messy
   * before it is organised, and forcing the organisation first kills the idea. */
  idea: (f = {}) => base('idea', {
    projectId: null,
    bookId: null,
    text: '',
    filedTo: null,          // the record it eventually became, if any
    ...f,
  }),

  /* PRD §26 — never overwrite creative work. A version is an immutable JSON
   * snapshot of the compiled book plus the reason it was taken. */
  version: (f = {}) => base('version', {
    projectId: null,
    bookId: null,
    label: 'Draft 0',
    reason: '',
    aiInvolved: false,
    words: 0,
    snapshot: '',           // serialised records, restored wholesale
    ...f,
  }),

  /* One row per book per day. Velocity measured from real history beats any
   * estimate, and it is the only way to tell an author whether a deadline is
   * ambitious or arithmetically impossible. */
  wordlog: (f = {}) => base('wordlog', {
    projectId: null,
    bookId: null,
    date: '',               // 'YYYY-MM-DD'
    words: 0,               // total book words at end of that day
    ...f,
  }),

  /* PRD §35 — the submission tracker. Equally a KDP listing or an agent query;
   * the fields that matter are the same either way. */
  submission: (f = {}) => base('submission', {
    projectId: null,
    bookId: null,
    pathway: 'traditional',
    target: '',             // agent, publisher, platform
    contact: '',
    sentOn: '',
    status: 'planned',      // planned | sent | replied | offer | rejected | live
    notes: '',
    ...f,
  }),

  note: (f = {}) => base('note', {
    projectId: null,
    bookId: null,
    slot: 'draft0',         // 'draft0' | 'story' | 'loose'
    title: 'Untitled note',
    body: '',
    ...f,
  }),
};

export function wordCount(text) {
  if (!text) return 0;
  const m = text.trim().match(/[\p{L}\p{N}'’-]+/gu);
  return m ? m.length : 0;
}

/* Scenes hold prose; everything above them is a container.
 * These two functions are the only ordering authority in the app. */
export function sortByOrder(records) {
  return [...records].sort((a, b) =>
    (a.order ?? 0) - (b.order ?? 0) || a.createdAt.localeCompare(b.createdAt));
}

/* reindex takes the array AS GIVEN and numbers it 0..n-1. It must not sort:
 * callers pass an array they have deliberately rearranged, and re-sorting by
 * the stale order values would quietly undo the move. (It did. See tests.) */
export function reindex(records) {
  return records.map((r, i) => ({ ...r, order: i }));
}
