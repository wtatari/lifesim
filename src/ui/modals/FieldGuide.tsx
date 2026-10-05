import { useMemo, useState, type ReactNode } from 'react';
import { ArrowRight, Search, Lightbulb } from 'lucide-react';
import { ui } from '../../app/ui.ts';
import { useStore } from '../../app/store.ts';
import { CHAPTERS, GUIDE, getEntry } from '../../content/glossary.ts';
import { Modal } from './Modal.tsx';

/** Renders **bold** and *italic* inline markup. */
export function Rich({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('**')) parts.push(<strong key={k++}>{tok.slice(2, -2)}</strong>);
    else parts.push(<em key={k++}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

export function FieldGuide() {
  const entryKey = useStore(ui, (s) => s.guideEntry);
  const [q, setQ] = useState('');
  const entry = entryKey ? getEntry(entryKey) : undefined;
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return GUIDE;
    return GUIDE.filter((g) => g.title.toLowerCase().includes(s) || g.summary.toLowerCase().includes(s) || g.body.some((b) => b.toLowerCase().includes(s)));
  }, [q]);
  const go = (key: string | null) => ui.set({ guideEntry: key });

  return (
    <Modal title="Field guide" eyebrow="How it all works" onClose={() => ui.set({ modal: null })} size="xl" className="guide-modal">
      <div className="guide">
        <nav className="guide-nav scroll" aria-label="Field guide contents">
          <label className="search">
            <Search size={14} />
            <input id="guide-search" placeholder="Search the guide" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          {CHAPTERS.map((ch) => {
            const items = filtered.filter((g) => g.chapter === ch.id);
            if (!items.length) return null;
            return (
              <div key={ch.id} className="guide-chapter">
                <div className="eyebrow">{ch.id}</div>
                <ul>
                  {items.map((g) => (
                    <li key={g.key}>
                      <button className={`guide-link ${entryKey === g.key ? 'active' : ''}`} onClick={() => go(g.key)}>
                        {g.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>
        <article className="guide-article scroll">
          {entry ? (
            <>
              <div className="eyebrow">{entry.chapter}</div>
              <h1>{entry.title}</h1>
              <p className="lead">
                <Rich text={entry.summary} />
              </p>
              {entry.body.map((p, i) => (
                <p key={i}>
                  <Rich text={p} />
                </p>
              ))}
              {entry.tryIt && (
                <div className="try-it">
                  <Lightbulb size={16} />
                  <div>
                    <strong>Try it</strong>
                    <p>
                      <Rich text={entry.tryIt} />
                    </p>
                  </div>
                </div>
              )}
              {entry.related && entry.related.length > 0 && (
                <div className="related">
                  <div className="eyebrow">Related</div>
                  <div className="related-list">
                    {entry.related.map((r) => {
                      const e = getEntry(r);
                      return e ? (
                        <button key={r} className="related-card" onClick={() => go(r)}>
                          <strong>{e.title}</strong>
                          <span>{e.summary}</span>
                          <ArrowRight size={14} />
                        </button>
                      ) : null;
                    })}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="guide-home">
              <h1>The ideas behind LifeSim</h1>
              <p className="lead">
                Every rule in the simulation is a real idea from biology or computer science. Pick a chapter, or open an entry from a discovery when it happens in your dish.
              </p>
              <div className="chapter-cards">
                {CHAPTERS.map((ch) => (
                  <button key={ch.id} className="chapter-card" onClick={() => go(GUIDE.find((g) => g.chapter === ch.id)!.key)}>
                    <span className="eyebrow">{GUIDE.filter((g) => g.chapter === ch.id).length} entries</span>
                    <strong>{ch.id}</strong>
                    <span>{ch.blurb}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </article>
      </div>
    </Modal>
  );
}
