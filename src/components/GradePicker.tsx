import { GRADE_INFO } from '../data/curriculum';
import type { Grade } from '../domain/types';
import { GRADES } from '../domain/types';
import { useStore } from '../state/store';

/** Grade 2–6 picker. Shows where the chosen grade sits in the MoE curriculum. */
export function GradePicker({ value, onChange, legend }: { value: Grade; onChange: (g: Grade) => void; legend?: string }) {
  const { t, lang } = useStore();
  return (
    <fieldset className="pick-group">
      <legend>{legend ?? t('באיזו כיתה?', 'Which grade?')}</legend>
      <div className="pick-row center">
        {GRADES.map((g) => (
          <button key={g} type="button" className={`pick grade-pick ${value === g ? 'on' : ''}`} aria-pressed={value === g} onClick={() => onChange(g)}>
            {lang === 'he' ? GRADE_INFO[g].he : `Grade ${g}`}
          </button>
        ))}
      </div>
      <p className="soft-note grade-note">📘 {lang === 'he' ? GRADE_INFO[value].stageHe : GRADE_INFO[value].stage}</p>
    </fieldset>
  );
}

/** Short grade label, e.g. "כיתה ג׳" / "Grade 3". */
export function gradeLabel(grade: Grade, lang: 'he' | 'en'): string {
  return lang === 'he' ? GRADE_INFO[grade].he : `Grade ${grade}`;
}
