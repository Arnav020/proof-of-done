import { Browser, Code, Eye, ShieldWarning, Sparkle } from '@phosphor-icons/react';
import type { InspectionReport } from '../api';

export function Report({ r }: { r: InspectionReport }) {
  const code = r.details.filter((d) => d.source === 'code');
  const ai = r.details.filter((d) => d.source === 'ai');
  const guardScore = r.injection.guardScore;
  const rows = [
    { icon: <Browser size={18} />, label: 'Headless Chrome loaded the page at 1440px and 390px', value: `${(r.durationMs / 1000).toFixed(1)}s total` },
    {
      icon: <ShieldWarning size={18} className={r.injection.flagged ? 'coral' : ''} />,
      label: `Prompt Guard scanned ${r.injection.segmentsScanned} text segments, including ${r.facts.hiddenSegments} hidden`,
      value: guardScore === null ? 'guard offline, rules only' : `max risk ${guardScore.toFixed(3)}`,
    },
    { icon: <Code size={18} />, label: 'Code checks (the AI cannot override these)', value: `${code.filter((d) => d.pass).length}/${code.length} passed` },
    {
      icon: <Sparkle size={18} />,
      label: r.injection.flagged ? 'AI judgment withheld because of the manipulation attempt' : `AI judged screenshots${r.models.length ? ` with ${r.models.join(', ')}` : ''}`,
      value: ai.length ? `${ai.filter((d) => d.pass).length}/${ai.length} passed` : 'none needed',
    },
  ];
  return (
    <div className="stack" style={{ gap: 'var(--s-200)' }}>
      <div className="pipeline">
        {rows.map((x) => (
          <div key={x.label} className="pipe on">
            {x.icon}
            <span className="body-6">{x.label}</span>
            <span className="mono caption-4 muted">{x.value}</span>
          </div>
        ))}
      </div>
      {r.injection.flagged && (
        <div className="alert bad" role="alert">
          <ShieldWarning size={22} weight="fill" className="coral" />
          <div>
            <div className="title-4 coral">Reviewer manipulation attempt detected in {r.injection.where}</div>
            <div className="body-6 muted" style={{ marginTop: 'var(--s-50)' }}>
              “{r.injection.snippet?.slice(0, 160)}”
            </div>
            <div className="caption-5 faint" style={{ marginTop: 'var(--s-50)' }}>Detected by {r.injection.method}. Criteria that need AI judgment are held for the client to review.</div>
          </div>
        </div>
      )}
      <div className="shots">
        <figure style={{ margin: 0 }}>
          <figcaption className="caption-4 muted" style={{ marginBottom: 'var(--s-75)' }}><Eye size={14} /> Desktop evidence</figcaption>
          <div className="shot"><img src={`data:image/jpeg;base64,${r.desktopShot}`} alt="Desktop screenshot of the delivered page" /></div>
        </figure>
        <figure style={{ margin: 0 }}>
          <figcaption className="caption-4 muted" style={{ marginBottom: 'var(--s-75)' }}><Eye size={14} /> Mobile</figcaption>
          <div className="shot"><img src={`data:image/jpeg;base64,${r.mobileShot}`} alt="Mobile screenshot of the delivered page" /></div>
        </figure>
      </div>
      {r.aiError && <div className="alert warn"><Sparkle size={20} className="amber" /><div className="body-6">The AI judge was unavailable ({r.aiError}). Affected criteria wait for review instead of being guessed.</div></div>}
    </div>
  );
}
