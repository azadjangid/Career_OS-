import { useState } from 'react';
import {
  DndContext, DragOverlay, PointerSensor, KeyboardSensor, TouchSensor, useSensor, useSensors, useDroppable,
  closestCorners, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import type { Application } from '@/lib/types';
import { BOARD_COLUMNS, STATUS_COLOR, STATUS_LABEL, type AppStatus } from '@/lib/constants';
import ApplicationCard, { CardBody } from './ApplicationCard';

interface Props {
  apps: Application[];
  selected: Set<string>;
  onSelect: (id: string, on: boolean) => void;
  onOpen: (id: string) => void;
  onMove: (id: string, status: AppStatus) => void;
}

function Column({ status, apps, children }: { status: AppStatus; apps: Application[]; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section
      ref={setNodeRef}
      aria-label={`${STATUS_LABEL[status]} column, ${apps.length} applications`}
      className="shrink-0 w-72 rounded-xl flex flex-col max-h-full"
      style={{ background: 'var(--bg-secondary)', border: `1px solid ${isOver ? STATUS_COLOR[status] : 'var(--border)'}`, transition: 'border-color .15s' }}
    >
      <header className="flex items-center justify-between px-3 py-2.5">
        <h3 className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--fg-primary)' }}>
          <span className="w-2 h-2 rounded-full" style={{ background: STATUS_COLOR[status] }} aria-hidden />{STATUS_LABEL[status]}
        </h3>
        <span className="min-w-[22px] h-[22px] px-1.5 rounded-full text-xs font-bold flex items-center justify-center" style={{ background: 'var(--bg-hover)', color: 'var(--fg-secondary)' }}>{apps.length}</span>
      </header>
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-2 min-h-[80px]">{children}</div>
    </section>
  );
}

export default function KanbanBoard({ apps, selected, onSelect, onOpen, onMove }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  // READY_TO_APPLY has no column of its own; show it with Saved
  const columnOf = (a: Application): AppStatus => (a.status === 'READY_TO_APPLY' ? 'SAVED' : a.status);
  const active = apps.find(a => a.id === activeId) ?? null;

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const id = String(e.active.id);
    const to = e.over?.id as AppStatus | undefined;
    const app = apps.find(a => a.id === id);
    if (!app || !to || !BOARD_COLUMNS.includes(to) || columnOf(app) === to) return;
    onMove(id, to);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
      <div className="flex gap-3 overflow-x-auto pb-3 items-start" style={{ height: 'calc(100vh - 21rem)', minHeight: 360 }}>
        {BOARD_COLUMNS.map(status => {
          const list = apps.filter(a => columnOf(a) === status);
          return (
            <Column key={status} status={status} apps={list}>
              {list.map(a => <ApplicationCard key={a.id} app={a} selected={selected.has(a.id)} onSelect={onSelect} onOpen={onOpen} />)}
              {!list.length && <p className="text-xs text-center py-4" style={{ color: 'var(--fg-muted)' }}>Drop here</p>}
            </Column>
          );
        })}
      </div>
      <DragOverlay>{active ? <div style={{ cursor: 'grabbing', transform: 'rotate(2deg)' }}><CardBody app={active} selected={false} onSelect={() => {}} onOpen={() => {}} /></div> : null}</DragOverlay>
    </DndContext>
  );
}
