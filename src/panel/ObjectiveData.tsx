import { useStore } from '../state/store';

/**
 * Dedicated objective-data surface. Replaces the abnormal-lab "tags" that used
 * to sit under the (intense) stem. Two jobs:
 *   1. A can't-miss flag when the stem links an exhibit / image / media. UWorld
 *      hides these behind bare `<a>exhibit</a>` anchors that flatten into the
 *      read-aloud text as a single word — easy to blow past in intense mode.
 *   2. Parsed vitals & labs with high/low alerts using the official USMLE
 *      reference ranges. Only sheet values are flagged; everything else the
 *      student reads directly off the question.
 */
export function ObjectiveData() {
  const question = useStore((s) => s.question);
  if (!question) return null;

  const exhibits = question.exhibits ?? [];
  const labs = question.labs ?? [];
  if (exhibits.length === 0 && labs.length === 0) return null;

  // Abnormals float to the top; parse order is preserved within each group.
  const abnormal = labs.filter((l) => l.status === 'low' || l.status === 'high');
  const rest = labs.filter((l) => l.status !== 'low' && l.status !== 'high');
  const ordered = [...abnormal, ...rest];

  return (
    <div className="card objdata">
      <div className="row">
        <h3>Objective Data</h3>
        {abnormal.length > 0 && (
          <span className="objdata__count">{abnormal.length} abnormal</span>
        )}
      </div>

      {exhibits.length > 0 && (
        <div className="objdata__exhibit" role="alert">
          <div className="objdata__exhibit-head">
            ⚠ Exhibit / image in the stem — open it on UWorld (not read aloud)
          </div>
          <div className="objdata__exhibit-tags">
            {exhibits.map((e, i) => (
              <span key={e + i} className="objdata__exhibit-tag">
                {e}
              </span>
            ))}
          </div>
        </div>
      )}

      {ordered.length > 0 && (
        <div className="objdata__list">
          {ordered.map((l) => (
            <div
              key={l.name + l.value}
              className={`objdata__row objdata__row--${l.status}`}
            >
              <span className="objdata__name">{l.name}</span>
              <span className="objdata__val">
                {l.status === 'high' && <span className="objdata__arrow">▲</span>}
                {l.status === 'low' && <span className="objdata__arrow">▼</span>}
                {l.value}
                {l.unit ? ` ${l.unit}` : ''}
              </span>
              {l.reference && <span className="objdata__ref">ref {l.reference}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
