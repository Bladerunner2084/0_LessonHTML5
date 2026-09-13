/* Audits.tsx — the Figma Make component, wired to the real engine.
 *
 * Every style, colour token, font size and letter-spacing below is exactly as
 * Figma Make produced it. The design is not what changed.
 *
 * What changed is seven lines:
 *
 *   -  const FINDINGS: AuditFinding[] = [ ...seven hand-written objects... ];
 *   +  const w = useWriteline();
 *   +  const findings = w.findings();
 *
 * The prototype's findings were literals, which means they were the same seven
 * strings for every writer, every book, forever. These are computed from the
 * author's actual manuscript on every render, by the same twenty-one rules the
 * 222-test engine enforces. Nothing is cached, so nothing can go stale.
 *
 * Note what the real findings are, and are not. The prototype invented
 * "Director Harel is described as left-handed" — a finding no software can
 * produce without an LLM reading the prose. The engine produces findings that
 * fall out of structure: a character on the page after they leave the story, a
 * scene leaning on a fact the reader was told twenty-three scenes ago. Those
 * cost nothing per user and cannot be hallucinated. The AI-dependent findings
 * are worth building too — they just belong behind the AI layer, priced
 * accordingly, and clearly separated from the ones that are free.
 */

import { useState } from 'react';
import useWriteline from './useWriteline';
import type { Finding, SeverityLabel } from './writeline';

const severityColor: Record<string, string> = {
  Critical: 'var(--health-red)',
  Moderate: 'var(--health-amber)',
  Note: 'var(--muted-foreground)',
};

export default function Audits() {
  const w = useWriteline();
  const findings = w.findings();

  const [filter, setFilter] = useState('All');
  const [activeId, setActiveId] = useState<string | null>(null);

  /* Filters are derived from what the engine actually reported. The prototype
   * hard-coded eight audit types, three of which never fire — an empty filter
   * that returns nothing reads as a broken product. */
  const types = ['All', ...Array.from(new Set(findings.map((f) => f.type))).sort()];
  const counts = findings.reduce<Record<string, number>>((acc, f) => {
    acc[f.type] = (acc[f.type] ?? 0) + 1;
    return acc;
  }, {});

  const filtered = filter === 'All' ? findings : findings.filter((f) => f.type === filter);
  const active: Finding | undefined =
    findings.find((f) => f.id === activeId) ?? filtered[0];

  return (
    <div className="h-full flex overflow-hidden">

      {/* Left: Filter + List */}
      <div
        className="shrink-0 flex flex-col overflow-hidden"
        style={{ width: 320, borderRight: '1px solid var(--border)', background: 'var(--background)' }}
      >
        <div className="px-4 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <p className="font-mono uppercase mb-1" style={{ fontSize: 9, letterSpacing: '0.14em', color: 'var(--muted-foreground)' }}>Editorial Intelligence</p>
          <h1 className="font-serif font-semibold" style={{ fontSize: 20, letterSpacing: '-0.025em' }}>Audit Center</h1>

          <div className="flex gap-3 mt-3">
            {(['Critical', 'Moderate', 'Note'] as SeverityLabel[]).map((s) => {
              const count = findings.filter((f) => f.label === s).length;
              return count > 0 ? (
                <span key={s} className="flex items-center gap-1" style={{ fontSize: 11, color: severityColor[s] }}>
                  <span className="font-mono font-semibold">{count}</span>
                  <span>{s}</span>
                </span>
              ) : null;
            })}
            {findings.length === 0 && (
              <span style={{ fontSize: 11, color: 'var(--health-green)' }}>Nothing flagged</span>
            )}
          </div>
        </div>

        <div className="p-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex flex-wrap gap-1">
            {types.map((t) => (
              <button
                key={t}
                onClick={() => setFilter(t)}
                className="px-2 py-0.5 rounded font-mono"
                style={{
                  fontSize: 9,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  background: filter === t ? 'var(--primary)' : 'var(--muted)',
                  color: filter === t ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
                  border: '1px solid var(--border)',
                  cursor: 'pointer',
                }}
              >
                {t}{t !== 'All' && counts[t] ? ` (${counts[t]})` : ''}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.map((f) => (
            <button
              key={f.id}
              onClick={() => setActiveId(f.id)}
              className="w-full text-left p-4"
              style={{
                background: active?.id === f.id ? 'var(--secondary)' : 'transparent',
                borderLeft: active?.id === f.id ? '2px solid var(--primary)' : '2px solid transparent',
                borderBottom: '1px solid var(--border)',
                cursor: 'pointer',
              }}
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="flex items-center gap-2">
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: severityColor[f.label], flexShrink: 0, marginTop: 3 }} />
                  <span className="font-mono" style={{ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted-foreground)' }}>{f.type}</span>
                </div>
              </div>
              <p style={{ fontSize: 12, color: 'var(--foreground)', lineHeight: 1.5, marginBottom: 4 }}>
                {f.description.length > 80 ? `${f.description.slice(0, 80)}…` : f.description}
              </p>
              {(f.chapter || f.scene) && (
                <p className="font-mono" style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>
                  {[f.chapter, f.scene].filter(Boolean).join(' · ')}
                </p>
              )}
            </button>
          ))}

          {filtered.length === 0 && (
            <p className="p-4" style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
              No findings of this type. That means the graph agrees with itself here — it does
              not mean the prose is good, and no number can say that.
            </p>
          )}
        </div>
      </div>

      {/* Right: Detail panel */}
      <div className="flex-1 overflow-y-auto p-6">
        {active ? (
          <>
            <div className="flex items-center gap-3 mb-5">
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: severityColor[active.label] }} />
              <span className="font-mono uppercase" style={{ fontSize: 9, letterSpacing: '0.14em', color: 'var(--muted-foreground)' }}>
                {active.type} · {active.label}
              </span>
            </div>

            {(active.chapter || active.sceneTitle) && (
              <div className="mb-1" style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
                <span className="font-mono">
                  {[active.chapter, active.scene].filter(Boolean).join(' · ')}
                  {active.sceneTitle ? ` — ${active.sceneTitle}` : ''}
                </span>
              </div>
            )}

            <div className="wl-line-motif mb-5" />

            <div className="mb-5 p-4 rounded" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
              <p className="font-mono uppercase mb-2" style={{ fontSize: 9, letterSpacing: '0.12em', color: 'var(--muted-foreground)' }}>Issue</p>
              <p style={{ fontSize: 14, lineHeight: 1.75, color: 'var(--foreground)', fontFamily: 'var(--font-display)' }}>{active.description}</p>
            </div>

            {/* The prototype called this "Suggested Resolution" and invented prose
                for it. The engine states what the RULE catches; proposing a fix
                for this particular scene is a craft judgement and belongs to the
                AI layer, labelled as a suggestion rather than as fact. */}
            <div className="mb-6 p-4 rounded" style={{ background: 'var(--muted)', border: '1px solid var(--border)' }}>
              <p className="font-mono uppercase mb-2" style={{ fontSize: 9, letterSpacing: '0.12em', color: 'var(--muted-foreground)' }}>Why this rule fires</p>
              <p style={{ fontSize: 14, lineHeight: 1.75, color: 'var(--foreground)', fontFamily: 'var(--font-display)' }}>{active.explain}</p>
            </div>

            <p className="font-mono uppercase mb-3" style={{ fontSize: 9, letterSpacing: '0.12em', color: 'var(--muted-foreground)' }}>Author Decision</p>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => active.recordId && w.open(w.current().projectId, w.current().bookId)}
                className="px-4 py-2 rounded"
                style={{ fontSize: 12, fontWeight: 500, background: 'var(--primary)', color: 'var(--primary-foreground)', border: 'none', cursor: 'pointer' }}
              >
                Open in Editor
              </button>
              {/* NOT wired, and deliberately not faked. Persisting "accepted as
                  written" needs a record the engine does not have yet, and it
                  carries a real design question: should a dismissal survive an
                  edit to the scene it was raised against? It should probably
                  expire, or an author silences a finding in draft two and never
                  sees it again in draft five. Decide that, then add the record. */}
              {['Accept as Written', 'Defer'].map((action) => (
                <button
                  key={action}
                  disabled
                  title="Needs a dismissal record — see the comment in this file"
                  className="px-4 py-2 rounded"
                  style={{ fontSize: 12, background: 'transparent', color: 'var(--muted-foreground)', border: '1px solid var(--border)', cursor: 'not-allowed', opacity: 0.55 }}
                >
                  {action}
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="h-full flex items-center justify-center">
            <p style={{ color: 'var(--muted-foreground)', fontSize: 13, textAlign: 'center', maxWidth: '32ch' }}>
              No contradictions found. That is not the same as “the book is good” — it means the
              story agrees with itself.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
