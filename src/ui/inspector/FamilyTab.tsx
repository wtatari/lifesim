import { useEffect, useState } from 'react';
import { useSim } from '../../app/context.ts';
import { openGuide } from '../../app/ui.ts';
import { speciesName } from '../../sim/species.ts';
import type { LifeRecord } from '../../sim/world.ts';
import { hueColor } from '../../render/palette.ts';
import { formatTime } from '../common.tsx';

const CAUSE: Record<string, string> = {
  starved: 'starved',
  eaten: 'eaten',
  'old age': 'old age',
  poisoned: 'poisoned',
  smitten: 'removed',
  meteor: 'meteor',
};

function Person({ r, relation, onSelect, alive }: { r: LifeRecord; relation: string; onSelect: (id: number) => void; alive: boolean }) {
  return (
    <button className={`person ${alive ? 'alive' : 'dead'}`} onClick={() => onSelect(r.id)} title={alive ? 'Select' : 'Show what we know about it'}>
      <span className="person-dot" style={{ background: hueColor(r.hue, 70, alive ? 62 : 40) }} />
      <span className="person-main">
        <span className="person-name">{r.name}</span>
        <span className="person-meta mono">
          {relation} · gen {r.generation}
        </span>
      </span>
      <span className={`person-status ${alive ? 'ok' : ''}`}>{alive ? 'alive' : CAUSE[r.cause ?? ''] ?? 'gone'}</span>
    </button>
  );
}

export function FamilyTab({ id }: { id: number }) {
  const ctl = useSim();
  const w = ctl.world;
  const rec = w.records.get(id);
  const [descendants, setDescendants] = useState<number | null>(null);
  useEffect(() => {
    setDescendants(w.livingDescendants(id));
    const t = setInterval(() => setDescendants(w.livingDescendants(id)), 3000);
    return () => clearInterval(t);
  }, [w, id]);

  if (!rec) return <p className="note">No records remain for this creature.</p>;
  const select = (rid: number) => ctl.select(rid, { focus: !!w.getCreature(rid) });
  const mother = rec.parentId ? w.records.get(rec.parentId) : undefined;
  const father = rec.mateId ? w.records.get(rec.mateId) : undefined;
  const kids = w.creatures.filter((c) => c.parentId === id || c.mateId === id);

  // Maternal line back to the founder.
  const line: LifeRecord[] = [];
  let cur = mother;
  while (cur && line.length < 40) {
    line.push(cur);
    cur = cur.parentId ? w.records.get(cur.parentId) : undefined;
  }
  const lost = line.length && line[line.length - 1].parentId !== 0;
  const mrcaId = w.mrca?.id;

  return (
    <div className="family-tab">
      <div className="family-stats">
        <div>
          <span className="eyebrow">Babies</span>
          <span className="big mono">{rec.children || w.getCreature(id)?.children || 0}</span>
        </div>
        <div>
          <span className="eyebrow">Living descendants</span>
          <span className="big mono">{descendants ?? '…'}</span>
        </div>
        <div>
          <span className="eyebrow">Born</span>
          <span className="big mono">T+{formatTime(rec.born)}</span>
        </div>
      </div>

      <div className="insp-section">
        <h3 className="section-title">Parents</h3>
        {mother ? (
          <div className="people">
            <Person r={mother} relation={father ? 'mother' : 'parent'} onSelect={select} alive={!!w.getCreature(mother.id)} />
            {father && <Person r={father} relation="father" onSelect={select} alive={!!w.getCreature(father.id)} />}
          </div>
        ) : rec.parentId ? (
          <p className="note">Its parents’ records have been archived.</p>
        ) : (
          <p className="note">A founder: it arrived in the dish without parents (at the start, or from the lab’s gene bank).</p>
        )}
      </div>

      {kids.length > 0 && (
        <div className="insp-section">
          <h3 className="section-title">
            Living children <span className="faint">({kids.length})</span>
          </h3>
          <div className="people">
            {kids.slice(0, 12).map((k) => {
              const r = w.records.get(k.id);
              return r ? <Person key={k.id} r={r} relation={k.parentId === id ? 'child' : 'child (as father)'} onSelect={select} alive /> : null;
            })}
          </div>
        </div>
      )}

      <div className="insp-section">
        <h3 className="section-title">Ancestors (mother’s line)</h3>
        {line.length === 0 ? (
          <p className="note">{rec.parentId ? 'Its ancestors’ records have been archived.' : 'None: it is a founder of its family line.'}</p>
        ) : (
          <ol className="lineage">
            {line.map((a, k) => {
              const prev = k === 0 ? rec : line[k - 1];
              const newSpecies = prev.speciesId !== a.speciesId;
              const sp = w.species.get(prev.speciesId);
              return (
                <li key={a.id} className={a.id === mrcaId ? 'is-mrca' : ''}>
                  {newSpecies && sp && (
                    <div className="lineage-split">
                      ↑ new species began here: <span className="latin">{speciesName(sp)}</span>
                    </div>
                  )}
                  <Person r={a} relation={k === 0 ? 'mother' : k === 1 ? 'grandmother' : `${k - 1}× great-grandmother`} onSelect={select} alive={!!w.getCreature(a.id)} />
                  {a.id === mrcaId && (
                    <button className="mrca-note" onClick={() => openGuide('common-ancestor')}>
                      ★ Common ancestor of every creature alive today
                    </button>
                  )}
                </li>
              );
            })}
            {lost && <li className="lineage-end faint">…older ancestors are no longer on record.</li>}
          </ol>
        )}
      </div>
    </div>
  );
}
