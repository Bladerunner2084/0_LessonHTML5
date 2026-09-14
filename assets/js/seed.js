/* seed.js — optional demonstration content.
 *
 * PRD #2 §2 and §52 are a hard architectural rule, and the previous version of
 * this file broke it: it seeded "ECHO 2084" — the author's own novel — into the
 * product, so a clean account would have opened carrying somebody else's story.
 * That is the difference between a platform and one writer's tool.
 *
 * The rules this file now obeys:
 *
 *   Nothing here is created unless the user asks for it. A new account has no
 *   projects and is offered "Create your first project".
 *
 *   Every project it creates is named "— Demo Project" and every record it
 *   writes is marked provisional or AI-suggested, never canon. Demo content
 *   cannot be mistaken for the author's own work by a person or by a later
 *   AI pass reading the graph.
 *
 *   No real author's manuscript, characters, world or names appear. The demo is
 *   "The Last Signal", invented for this purpose (PRD §53).
 *
 * The fixture ships with two deliberate continuity faults, because a clean
 * sample demonstrates nothing about a continuity engine.
 */

import * as S from './state.js';

const DEMO_SUFFIX = ' — Demo Project';

export async function seedDemo() {
  const project = await S.create('project', {
    title: `The Last Signal${DEMO_SUFFIX}`,
    kind: 'novel',
    canon: 'provisional',
    logline: 'Demonstration content. Not a real manuscript.',
  });
  const pid = project.id;
  const book = await S.create('book', {
    projectId: pid, title: project.title, order: 0, targetWords: 95000, canon: 'provisional',
  });
  const bid = book.id;

  /* Nothing the demo invents is canon. The canon-discipline rules in lint.js
   * read exactly this field, so the fixture demonstrates the platform's central
   * promise instead of describing it. */
  const at = (f) => ({ projectId: pid, bookId: bid, canon: 'provisional', ...f });

  await S.create('note', at({
    slot: 'draft0', title: 'Draft 0',
    body: 'A relay station picks up a transmission that is addressed to someone. '
      + 'Nobody on the station is expecting mail.\n\n'
      + 'The question the book is asking: if a message finds you by name, does that '
      + 'make you the person it was meant for?\n\n'
      + 'Ending, maybe: she answers it. That should feel like courage and read like a '
      + 'mistake.',
  }));

  await S.create('note', at({
    slot: 'story', title: 'Premise & argument',
    body: 'Premise: a signal arrives with a recipient and no sender.\n\n'
      + 'Argument: being chosen is not the same as being known.\n\n'
      + 'Rule I refuse to break: the reader never hears the signal directly.',
  }));

  const mk = (kind, name, summary, fields) =>
    S.create('entity', at({ kind, name, summary, fields }));

  const lead = await mk('character', 'Ines Calloway',
    'Relay technician, nine years on the station, one unlogged decision she has never explained.', {
      Want: 'To finish the rotation and go home.',
      Need: 'To be known by someone who is not paid to know her.',
      Wound: 'She logged a distress call as noise and was right, and it has not helped.',
      'Lie they believe': 'Being careful is the same as being good.',
      'Would NEVER do': 'Answer on behalf of someone else.',
      Voice: 'Flat, technical, allergic to metaphor until she is frightened.',
    });
  const fixer = await mk('character', 'Tomas Rell',
    'Station administrator. Agreeable in the way a locked door is agreeable.', {
      Want: 'The relay to stay quiet.',
      Method: 'Let people reach the conclusion you need them to reach.',
    });
  const builder = await mk('character', 'Dr. Ana Ferreira',
    'Designed the relay. Regrets the architecture, not the decision.', {
      Want: 'Absolution she will not ask for.',
      Wound: 'Her first correction was to her own record.',
    });
  const sister = await mk('character', 'Dana Calloway',
    'Ines’s sister. Filed as lost before the book opens.', {
      'Function in plot': 'The correction Ines cannot see, because she is standing inside it.',
    });

  const platform = await mk('location', 'Relay Nine',
    'Wet steel, sodium light, and no window that faces anything.', {
      'Sensory signature': 'Ozone and cold iron.',
    });
  const archive = await mk('location', 'The Vault',
    'Where the station keeps what it has decided not to transmit.', {
      'Who controls it': 'Officially the Authority. Actually Tomas.',
    });
  await mk('faction', 'The Authority',
    'Licenses transmission. Audits nothing it owns.', {});
  await mk('item', 'Carrier buffer',
    'Station hardware. Read-only by regulation, write-capable by design.', {
      'Cost of using it': 'Every carry leaves residue.',
    });
  await mk('concept', 'Chosen versus known',
    'The argument: a message addressed to you is not the same as being understood.', {
      'Thematic weight': 'Every act break should re-ask it with higher stakes.',
    });

  const chapterSpecs = [
    ['Handoff', 'Establish the job, the rules, and the residue.', [
      ['Relay Nine, 04:12', 'Ines takes a carry she is told not to open.', 'drafted', lead, platform,
        'The rain on Relay Nine does not fall so much as accumulate.\n\n'
        + 'Tomas was already at the console when she arrived, which meant he had been '
        + 'there a while, which meant the handoff had a second purpose she had not been told.'],
      ['The return leg', 'Something writes into the buffer while she sleeps.', 'drafted', lead, platform,
        'She woke with a memory of a kitchen she had never stood in.'],
    ]],
    ['Residue', 'The first contradiction Ines cannot explain away.', [
      ['Ferreira’s office', 'Ines asks the wrong question well.', 'drafted', lead, archive,
        'Ferreira did not deny it. She reorganised it.'],
      ['The sister who is filed', 'Dana appears, and should not be able to.', 'outlined', lead, archive, ''],
    ]],
    ['The Vault', 'The reveal and its price.', [
      ['What the relay is for', 'Tomas explains the Vault to Ines.', 'outlined', fixer, archive, ''],
      ['Answering', 'Ines decides.', 'blank', lead, archive, ''],
    ]],
  ];

  const scenes = {};
  for (const [ci, [title, summary, list]] of chapterSpecs.entries()) {
    const chapter = await S.create('chapter', at({ title, summary, order: ci, targetWords: 4000 }));
    for (const [si, [sTitle, sSummary, status, pov, place, prose]] of list.entries()) {
      scenes[sTitle] = await S.create('scene', at({
        chapterId: chapter.id, order: si, title: sTitle, summary: sSummary, status,
        pov: pov.id, locationId: place.id, presentIds: [pov.id], prose,
      }));
    }
  }

  /* Chronology. Order in this array IS story time. */
  const beatSpecs = [
    ['Dana is filed', 'death', 'Year 3', [sister.id], null],
    ['Ferreira builds the relay', 'event', 'Year 1', [builder.id], null],
    ['The handoff at Relay Nine', 'event', 'Day 1, 04:12', [lead.id, fixer.id], 'Relay Nine, 04:12'],
    ['Write-back on the return leg', 'event', 'Day 2, 02:40', [lead.id], 'The return leg'],
    ['Ines confronts Ferreira', 'event', 'Day 4, 11:00', [lead.id, builder.id], 'Ferreira’s office'],
    ['Dana appears in the vault', 'event', 'Day 5, 23:15', [lead.id, sister.id], 'The sister who is filed'],
    ['Tomas explains the Vault', 'event', 'Day 6, 09:00', [lead.id, fixer.id], 'What the relay is for'],
  ];

  const beats = {};
  for (const [i, [label, kind, storyTime, entityIds, sceneTitle]] of beatSpecs.entries()) {
    beats[label] = await S.create('beat', at({
      label, kind, storyTime, entityIds, order: i,
      sceneId: sceneTitle ? scenes[sceneTitle].id : null,
    }));
  }

  const echo = await S.create('revelation', at({
    label: 'The signal is addressed to Ines',
    fact: 'The transmission names her. It was sent before she was posted to the station.',
    weight: 'twist',
    revealedIn: scenes['What the relay is for'].id,
    plantedIn: [scenes['The return leg'].id, scenes['Ferreira’s office'].id],
    knownBy: [
      { entityId: fixer.id, sinceBeatId: beats['Ferreira builds the relay'].id },
      { entityId: builder.id, sinceBeatId: beats['Ferreira builds the relay'].id },
    ],
  }));

  await S.create('revelation', at({
    label: 'Dana was corrected, not lost',
    fact: 'Dana’s loss record is an edit the Authority signed off on.',
    weight: 'major',
    revealedIn: null,
    plantedIn: [],
    knownBy: [{ entityId: fixer.id, sinceBeatId: null }],
  }));

  /* --- the two planted faults ---------------------------------------- */

  /* 1. Premature knowledge: read in chapter two, revealed in chapter three. */
  await S.patch(scenes['Ferreira’s office'].id, {
    usesRevelationIds: [echo.id],
    presentIds: [lead.id, builder.id],
  });

  /* 2. Ghost cast: Dana's exit is first in story time, so she cannot stand in a
   * scene placed on Day 5 without a flashback flag. */
  await S.patch(scenes['The sister who is filed'].id, {
    presentIds: [lead.id, sister.id],
  });

  /* One record left as an outright AI suggestion, so Continuity shows the
   * difference between "not settled yet" and "a machine proposed this". */
  await S.patch(fixer.id, { canon: 'suggested' });

  await S.create('decision', at({
    label: 'The reader learns the signal names Ines no earlier than the Vault scene',
    rationale: 'The whole back half depends on the reader trusting her account. Reveal it '
      + 'early and every scene before it reads as a trick.',
    status: 'locked',
  }));
  await S.create('question', at({
    text: 'If the signal predates her posting, who addressed it, and to which Ines?',
    status: 'open',
  }));
  await S.create('idea', at({
    text: 'What if the relay is not storing messages but rehearsing them?',
  }));

  await S.snapshotBook(bid, {
    label: 'Draft 0',
    reason: 'Preserved automatically when the demonstration project was created.',
  });

  return project;
}

/* A three-book series, so series behaviour is demonstrable. Also a demo, also
 * labelled, also never canon. */
export async function seedDemoSeries() {
  const series = await S.createProject({
    title: `Example Series${DEMO_SUFFIX}`, kind: 'series', bookCount: 3,
  });
  await S.create('entity', {
    projectId: series.id,
    bookId: null,
    kind: 'concept',
    canon: 'provisional',
    name: 'Series spine',
    summary: 'The question all three books re-ask. Shared, not copied — edit it once.',
  });

  /* createProject scaffolds a chapter, a scene and a Draft 0 note per book, and
   * those default to canon like anything a human makes. Demo content never does,
   * so they are demoted here — otherwise the fixture would be asserting that
   * invented scaffolding is established fact. */
  const demoted = ['book', 'chapter', 'scene', 'note']
    .flatMap((type) => S.list(type))
    .filter((r) => r.projectId === series.id && r.canon !== 'provisional')
    .map((r) => ({ id: r.id, canon: 'provisional' }));
  if (demoted.length) await S.patchMany(demoted);

  return series;
}

/* What the "Load demo" affordance runs. PRD §53: optional, explicit, and never
 * applied to a new account automatically. */
export async function seedPlatform() {
  const demo = await seedDemo();
  const series = await seedDemoSeries();
  S.setUi({
    projectId: demo.id,
    bookId: S.books(demo.id)[0]?.id ?? null,
    view: 'dashboard',
    selectionId: null,
  });
  return { demo, series };
}
