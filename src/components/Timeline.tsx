import { useEffect, useRef } from 'react';
import type { Project } from '../api';
import '@bryntum/gantt/gantt.css';
import '@bryntum/gantt/stockholm-dark.css';
import '@bryntum/gantt/fontawesome/css/fontawesome.css';
import '@bryntum/gantt/fontawesome/css/solid.css';

const COLOR: Record<string, string> = {
  awaiting_funding: 'gray', funded: 'blue', in_review: 'orange', partially_paid: 'lime', paid: 'green', voided: 'red',
};
const LABEL: Record<string, string> = {
  awaiting_funding: 'Awaiting PayPal funding', funded: 'Funds held by PayPal', in_review: 'Under inspection',
  partially_paid: 'Partially captured', paid: 'Fully captured', voided: 'Voided, client not charged',
};

/**
 * Bryntum Gantt: each milestone is a task, chained by finish-to-start dependencies. Progress is the share
 * of the milestone PayPal has captured, so an unpaid tranche visibly holds back the next phase.
 */
export function Timeline({ project }: { project: Project }) {
  const el = useRef<HTMLDivElement>(null);
  const gantt = useRef<{ destroy: () => void; project: { loadInlineData: (d: unknown) => Promise<void> } } | null>(null);

  const data = () => {
    const start = new Date(project.createdAt);
    start.setHours(0, 0, 0, 0);
    return {
      tasksData: project.milestones.map((m) => ({
        id: m.id,
        name: `${m.title} · $${m.amount.toFixed(2)}`,
        startDate: new Date(start.getTime() + m.startOffsetDays * 86400000),
        duration: m.durationDays,
        percentDone: Math.round((m.payment.captured / m.amount) * 100),
        eventColor: COLOR[m.status] ?? 'gray',
        manuallyScheduled: false,
        note: LABEL[m.status],
      })),
      dependenciesData: project.milestones.slice(1).map((m, i) => ({ id: `d${i}`, fromTask: project.milestones[i].id, toTask: m.id })),
      startDate: start,
    };
  };

  useEffect(() => {
    let disposed = false;
    import('@bryntum/gantt').then(({ Gantt, StringHelper }) => {
      if (disposed || !el.current) return;
      const d = data();
      gantt.current = new Gantt({
        appendTo: el.current,
        readOnly: true,
        rowHeight: 48,
        barMargin: 10,
        viewPreset: 'weekAndDayLetter',
        project: { tasksData: d.tasksData, dependenciesData: d.dependenciesData, startDate: d.startDate },
        columns: [
          { type: 'name', field: 'name', text: 'Milestone', width: 250 },
          { text: 'Payment state', field: 'note', width: 190, renderer: ({ value }: { value: string }) => StringHelper.encodeHtml(value ?? '') },
        ],
        taskRenderer: ({ taskRecord }: { taskRecord: { percentDone: number } }) => `${Math.round(taskRecord.percentDone)}% paid`,
        features: { taskMenu: false, taskEdit: false, cellMenu: false, headerMenu: false, taskDrag: false, taskResize: false, dependencyEdit: false },
      }) as unknown as typeof gantt.current;
    });
    return () => {
      disposed = true;
      gantt.current?.destroy();
      gantt.current = null;
    };
    // Mount once; data updates go through loadInlineData below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (gantt.current) void gantt.current.project.loadInlineData(data());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project]);

  return <div ref={el} className="gantt-box" aria-label="Milestone payment timeline" />;
}
