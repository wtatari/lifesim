import { useEffect, useRef, useState } from 'react';
import { Check, GraduationCap, X } from 'lucide-react';
import { useSim } from '../../app/context.ts';
import { pushLog, ui } from '../../app/ui.ts';
import { useStore } from '../../app/store.ts';
import { getLesson, LESSONS } from '../../content/lessons.ts';
import { Rich } from '../modals/FieldGuide.tsx';

export function LessonCoach({ onStartLesson, onExit }: { onStartLesson: (id: string) => void; onExit: () => void }) {
  const ctl = useSim();
  const lessonId = useStore(ui, (s) => s.lessonId);
  const stepIdx = useStore(ui, (s) => s.lessonStep);
  const lesson = getLesson(lessonId);
  const step = lesson?.steps[stepIdx];
  const [justDone, setJustDone] = useState(false);
  const entered = useRef<string>('');

  // Run the step's setup once when it becomes active.
  useEffect(() => {
    if (!lesson || !step) return;
    const key = `${lesson.id}:${stepIdx}`;
    if (entered.current === key) return;
    entered.current = key;
    setJustDone(false);
    step.onEnter?.(ctl);
  }, [lesson, step, stepIdx, ctl]);

  // Auto-advance when the learner completes the task.
  const complete = !!(step?.done && step.done(ctl));
  useEffect(() => {
    if (!complete) {
      setJustDone(false);
      return;
    }
    setJustDone(true);
    const t = setTimeout(() => ui.set((s) => ({ lessonStep: s.lessonStep + 1 })), 900);
    return () => clearTimeout(t);
  }, [complete, stepIdx, lessonId]);

  // Mark the lesson complete at the end.
  const finished = !!lesson && stepIdx >= lesson.steps.length;
  useEffect(() => {
    if (!finished || !lesson) return;
    const done = ui.get().completedLessons;
    if (!done.includes(lesson.id)) ui.set({ completedLessons: [...done, lesson.id] });
    pushLog({ t: ctl.world.time, kind: 'lesson', text: `Lesson complete: ${lesson.title}` });
  }, [finished, lesson, ctl]);

  if (!lesson) return null;

  if (finished) {
    const idx = LESSONS.findIndex((l) => l.id === lesson.id);
    const next = LESSONS[idx + 1];
    return (
      <div className="coach glass coach-finished" role="dialog" aria-label="Lesson complete">
        <div className="coach-head">
          <span className="coach-badge done">
            <Check size={14} />
          </span>
          <span className="eyebrow">Lesson complete</span>
          <button className="icon-btn sm" onClick={onExit} aria-label="Close lesson">
            <X size={15} />
          </button>
        </div>
        <h3>{lesson.title}</h3>
        <ul className="takeaways">
          {lesson.takeaways.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <div className="coach-actions">
          <button className="btn ghost" onClick={onExit}>
            Keep exploring
          </button>
          {next ? (
            <button className="btn primary" onClick={() => onStartLesson(next.id)}>
              Next: {next.title}
            </button>
          ) : (
            <button className="btn primary" onClick={onExit}>
              Finish the Academy
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!step) return null;
  const prog = step.progress?.(ctl);
  return (
    <>
      {step.target && <Spotlight selector={step.target} />}
      <div className="coach glass" role="dialog" aria-label={`Lesson: ${lesson.title}`}>
        <div className="coach-head">
          <span className="coach-badge">
            <GraduationCap size={14} />
          </span>
          <span className="eyebrow">
            {lesson.title} · {stepIdx + 1}/{lesson.steps.length}
          </span>
          <button className="icon-btn sm" onClick={onExit} aria-label="Leave lesson" title="Leave lesson">
            <X size={15} />
          </button>
        </div>
        <div className="coach-dots" aria-hidden="true">
          {lesson.steps.map((_, i) => (
            <span key={i} className={i < stepIdx ? 'done' : i === stepIdx ? 'now' : ''} />
          ))}
        </div>
        <h3>{step.title}</h3>
        <p>
          <Rich text={step.body} />
        </p>
        {prog && (
          <div className="coach-progress">
            <div className="meter-track">
              <div className="meter-fill" style={{ width: `${Math.min(100, (prog.value / prog.max) * 100)}%` }} />
            </div>
            <span className="mono">
              {Math.min(prog.value, prog.max)}/{prog.max} {prog.label}
            </span>
          </div>
        )}
        {justDone ? (
          <div className="coach-done">
            <Check size={16} /> Nice!
          </div>
        ) : step.done ? (
          step.hint && <p className="coach-hint">{step.hint}</p>
        ) : (
          <div className="coach-actions">
            {stepIdx > 0 && (
              <button className="btn ghost sm" onClick={() => ui.set({ lessonStep: stepIdx - 1 })}>
                Back
              </button>
            )}
            <button className="btn primary" onClick={() => ui.set({ lessonStep: stepIdx + 1 })}>
              {step.cta ?? 'Next'}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function Spotlight({ selector }: { selector: string }) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    // Bring the target into view once (it may sit inside a scrolled panel).
    const t = setTimeout(() => document.querySelector(selector)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 150);
    return () => clearTimeout(t);
  }, [selector]);
  useEffect(() => {
    let raf = 0;
    let last = '';
    const tick = () => {
      const el = document.querySelector(selector);
      const r = el?.getBoundingClientRect() ?? null;
      const key = r ? `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)},${Math.round(r.height)}` : '';
      if (key !== last) {
        last = key;
        setRect(r && r.width > 0 ? r : null);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [selector]);
  if (!rect) return null;
  const pad = 6;
  return (
    <div
      className="spotlight"
      aria-hidden="true"
      style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }}
    />
  );
}
