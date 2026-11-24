import { En } from '../../components/ui';
import { navigate } from '../../lib/router';
import { useStore } from '../../state/store';

/** The button that opens Little Explorers (first English words for age 4). */
export function LittleEntry({ className = '' }: { className?: string }) {
  const { t } = useStore();
  return (
    <button type="button" className={`little-entry ${className}`} onClick={() => navigate('little')}>
      <span className="little-entry-emoji" aria-hidden="true">🧸</span>
      <span>
        <b>
          <En>Little Explorers</En> · {t('גיל 4', 'age 4')}
        </b>
        <small>{t('מילים ראשונות באנגלית עם תמונות וצלילים', 'First English words with pictures and sounds')}</small>
      </span>
    </button>
  );
}
