/* seed.js — the ECHO 2084 sample project.
 *
 * It ships with two deliberate continuity errors: a scene that leans on a fact
 * the reader has not been given yet, and a character standing in a scene set
 * after she is gone. Load the sample, open Continuity, and the app explains
 * itself in about four seconds. A clean sample would demonstrate nothing.
 */

import * as S from './state.js';

export async function seedEcho2084() {
  const project = await S.create('project', {
    title: 'ECHO 2084',
    kind: 'novel',
    logline: 'A memory courier discovers the archive she protects is editing her.',
  });
  const pid = project.id;
  const book = await S.create('book', {
    projectId: pid, title: 'ECHO 2084', order: 0, targetWords: 95000,
  });
  const bid = book.id;
  const at = (f) => ({ projectId: pid, bookId: bid, ...f });

  await S.create('note', at({
    slot: 'draft0', title: 'Draft 0',
    body: 'Courier city. Everyone rents memory the way they rent power. Mara moves other '
      + "people's recollections across the grid in a cortical buffer she is not licensed to "
      + 'read. Somebody starts writing into the buffer on the return leg.\n\n'
      + 'The question the book is asking: if the record of you is edited and you cannot tell, '
      + 'were you ever the author?\n\n'
      + 'Ending, maybe: she chooses the edited version. Because it is kinder. That should '
      + 'feel like a defeat and read like mercy.',
  }));

  await S.create('note', at({
    slot: 'story', title: 'Premise & argument',
    body: 'Premise: memory is infrastructure, and infrastructure gets maintained by whoever '
      + 'owns it.\n\nArgument: authorship is not about accuracy. It is about consent.\n\n'
      + 'Rule I refuse to break: the reader never sees a memory Mara has not carried.',
  }));

  const mk = async (kind, name, summary, fields) =>
    S.create('entity', at({ kind, name, summary, fields }));

  const mara = await mk('character', 'Mara Vance',
    'Memory courier, eleven years on the grid, one unlicensed read she has never confessed.', {
      Want: 'To finish the run and get paid.',
      Need: 'To be the author of her own record.',
      Wound: 'She read a dying client’s buffer and kept the memory.',
      'Lie they believe': 'Carrying is not the same as taking.',
      Voice: 'Clipped, present tense, allergic to metaphor until she is frightened.',
    });
  const iyo = await mk('character', 'Iyo Sable',
    'Archive fixer. Charming in the way a door is charming when it is the only one.', {
      Want: 'The Cradle intact.',
      Method: 'Let people conclude what you need them to conclude.',
    });
  const kroft = await mk('character', 'Dr. Ansel Kroft',
    'Built the Cradle. Regrets the architecture, not the decision.', {
      Want: 'Absolution he will not ask for.',
      Wound: 'His first edit was on his own daughter.',
    });
  const tessa = await mk('character', 'Tessa Vance',
    'Mara’s sister. Dead before the book opens — or filed that way.', {
      'Function in plot': 'The edit Mara cannot see because she is standing inside it.',
    });

  const terminus = await mk('location', 'Terminus Station',
    'Where couriers hand off. Wet concrete, sodium light, no cameras that work.', {
      'Sensory signature': 'Ozone and cold iron.',
    });
  const cradle = await mk('location', 'The Cradle',
    'The archive itself. Nobody agrees whether it is a building or a process.', {
      'Who controls it': 'Officially the Registry. Actually Iyo.',
    });
  const registry = await mk('faction', 'The Registry',
    'Licenses memory transit. Audits nothing it owns.', {});
  const buffer = await mk('item', 'Cortical buffer',
    'Courier hardware. Read-only by law, write-capable by design.', {
      'Cost of using it': 'Every carry leaves residue.',
    });
  await mk('concept', 'Consent vs. accuracy',
    'The book’s central argument: an accurate record you did not agree to is still a theft.', {
      'Thematic weight': 'Every act break should re-ask it with higher stakes.',
    });

  /* Chapters and scenes, in reading order. */
  const chapterSpecs = [
    ['Handoff', 'Establish the job, the rules, and the residue.', [
      ['Terminus, 04:12', 'Mara takes a buffer she is told not to read.', 'drafted', mara, terminus,
        'The rain at Terminus does not fall so much as accumulate.\n\n'
        + 'Iyo was already there when she arrived, which meant he had been there a while, '
        + 'which meant the handoff had a second purpose she had not been told about.'],
      ['The return leg', 'Something writes into the buffer while she sleeps.', 'drafted', mara, terminus,
        'She woke with a memory of a kitchen she had never stood in.'],
    ]],
    ['Residue', 'The first contradiction Mara cannot explain away.', [
      ['Kroft’s office', 'Mara asks the wrong question well.', 'drafted', mara, cradle,
        'Kroft did not deny it. He reorganised it.'],
      ['The sister who is filed', 'Tessa appears, and should not be able to.', 'outlined', mara, cradle, ''],
    ]],
    ['The Cradle', 'The reveal and its price.', [
      ['What the archive is for', 'Iyo explains the Cradle to Mara.', 'outlined', iyo, cradle, ''],
      ['Choosing the kinder version', 'Mara decides.', 'blank', mara, cradle, ''],
    ]],
  ];

  const scenesByTitle = {};
  for (const [ci, [title, summary, scenes]] of chapterSpecs.entries()) {
    const chapter = await S.create('chapter', at({
      title, summary, order: ci, targetWords: 4000,
    }));
    for (const [si, [sTitle, sSummary, status, pov, place, prose]] of scenes.entries()) {
      const scene = await S.create('scene', at({
        chapterId: chapter.id,
        order: si,
        title: sTitle,
        summary: sSummary,
        status,
        pov: pov.id,
        locationId: place.id,
        presentIds: [pov.id],
        prose,
      }));
      scenesByTitle[sTitle] = scene;
    }
  }

  /* Chronology. Order in this array IS story time. */
  const beatSpecs = [
    ['Tessa is filed', 'death', 'Year 2081', [tessa.id], null],
    ['Kroft builds the Cradle', 'event', 'Year 2079', [kroft.id], null],
    ['The handoff at Terminus', 'event', 'Day 1, 04:12', [mara.id, iyo.id], 'Terminus, 04:12'],
    ['Write-back on the return leg', 'event', 'Day 2, 02:40', [mara.id], 'The return leg'],
    ['Mara confronts Kroft', 'event', 'Day 4, 11:00', [mara.id, kroft.id], 'Kroft’s office'],
    ['Tessa appears in the archive', 'event', 'Day 5, 23:15', [mara.id, tessa.id],
      'The sister who is filed'],
    ['Iyo explains the Cradle', 'event', 'Day 6, 09:00', [mara.id, iyo.id],
      'What the archive is for'],
  ];

  const beats = {};
  for (const [i, [label, kind, storyTime, entityIds, sceneTitle]] of beatSpecs.entries()) {
    beats[label] = await S.create('beat', at({
      label, kind, storyTime, entityIds, order: i,
      sceneId: sceneTitle ? scenesByTitle[sceneTitle].id : null,
    }));
  }

  /* Revelations. */
  const echo = await S.create('revelation', at({
    label: 'Mara is an echo',
    fact: 'The Mara carrying the buffer is a reconstruction. The original consented once, '
      + 'to something else.',
    weight: 'twist',
    revealedIn: scenesByTitle['What the archive is for'].id,
    plantedIn: [scenesByTitle['The return leg'].id, scenesByTitle['Kroft’s office'].id],
    knownBy: [
      { entityId: iyo.id, sinceBeatId: beats['Kroft builds the Cradle'].id },
      { entityId: kroft.id, sinceBeatId: beats['Kroft builds the Cradle'].id },
    ],
  }));

  await S.create('revelation', at({
    label: 'Tessa was edited, not killed',
    fact: 'Tessa’s death record is an edit the Registry signed off on.',
    weight: 'major',
    revealedIn: null,
    plantedIn: [],
    knownBy: [{ entityId: iyo.id, sinceBeatId: null }],
  }));

  /* --- the two planted faults ---------------------------------------- */

  /* 1. Premature knowledge: this scene is read in chapter 2, but the reader
   *    is not given the echo reveal until chapter 3. */
  await S.patch(scenesByTitle['Kroft’s office'].id, {
    usesRevelationIds: [echo.id],
    presentIds: [mara.id, kroft.id],
  });

  /* 2. Ghost cast: Tessa's exit beat is first in story time, so she cannot
   *    stand in a scene placed on Day 5 without a flashback flag. */
  await S.patch(scenesByTitle['The sister who is filed'].id, {
    presentIds: [mara.id, tessa.id],
  });

  S.setUi({ projectId: pid, bookId: bid, view: 'audit', selectionId: null });
  return project;
}

/* seedPlatform — the full shape: one worked project, one empty novel, one
 * three-book series. The empty ones are not filler. They are the two cases that
 * break naive outliners: a project with nothing in it yet, and a series whose
 * character and world bibles have to be shared across three books without
 * being copied three times.
 */
export async function seedPlatform() {
  const echo = await seedEcho2084();

  await S.createProject({ title: 'Future Novel', kind: 'novel' });

  const series = await S.createProject({
    title: 'Future Series', kind: 'series', bookCount: 3,
  });

  /* One shared entity, to make the series-scope mechanic visible immediately:
   * bookId === null means it belongs to every book in the project. */
  await S.create('entity', {
    projectId: series.id,
    bookId: null,
    kind: 'concept',
    name: 'Series spine',
    summary: 'The question all three books re-ask. Shared, not copied — edit it once.',
  });

  S.setUi({
    projectId: echo.id,
    bookId: S.books(echo.id)[0]?.id ?? null,
    view: 'audit',
    selectionId: null,
  });
  return echo;
}
