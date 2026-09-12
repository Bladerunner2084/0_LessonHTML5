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
];

export const ENTITY_KINDS = {
  character: { label: 'Character', bible: 'character', icon: '◈' },
  location:  { label: 'Location',  bible: 'world',     icon: '◉' },
  faction:   { label: 'Faction',   bible: 'world',     icon: '⬢' },
  item:      { label: 'Item',      bible: 'world',     icon: '◆' },
  concept:   { label: 'Concept',   bible: 'story',     icon: '◇' },
};

export const SCENE_STATUS = ['blank', 'outlined', 'drafted', 'revised', 'locked'];

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
  return { id: uid(type.slice(0, 3)), type, createdAt: now(), updatedAt: now(), ...fields };
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
