import React, { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';

// ---- Types ----

interface Task {
  id: string;
  title: string;
  notes: string | null;
  status: 'inbox' | 'today' | 'upcoming' | 'anytime' | 'someday' | 'completed' | 'canceled' | 'trash';
  projectId: string | null;
  projectTitle: string | null;
  areaId: string | null;
  areaTitle: string | null;
  tags: string[];
  checklistItems: Array<{ title: string; completed: boolean }>;
  deadline: string | null;
  whenDate: string | null;
  createdAt: string;
  modifiedAt: string;
  completedAt: string | null;
  canceledAt: string | null;
}

interface Area { uuid: string; title: string; }
interface Project { uuid: string; title: string; area_id: string | null; status: number; trashed: boolean; }
interface Tag { uuid: string; title: string; }

interface ChangeEntry {
  id: string;
  operation: string;
  taskId: string;
  before: Task | null;
  after: Task | null;
  createdAt: string;
  undoneAt: string | null;
}

type View =
  | 'inbox' | 'today' | 'upcoming' | 'someday' | 'logbook'
  | { type: 'project'; id: string }
  | { type: 'area'; id: string }
  | { type: 'tag'; name: string };

interface Toast { id: string; message: string; entryId: string; }

// ---- API client ----

let _token = '';

async function initToken(): Promise<void> {
  try {
    const res = await fetch('/api/config');
    const data = await res.json() as { token: string };
    _token = data.token;
  } catch {
    console.error('Failed to fetch token from /api/config');
  }
}

function token(): string {
  return _token;
}

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token()}`,
      ...options?.headers,
    },
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json();
}

const api = {
  getTasks: (params?: Record<string, string>): Promise<Task[]> => {
    const q = params ? '?' + new URLSearchParams(params).toString() : '';
    return apiFetch(`/api/tasks${q}`);
  },
  createTask: (body: object): Promise<{ id: string; task: Task; entryId: string }> =>
    apiFetch('/api/tasks', { method: 'POST', body: JSON.stringify(body) }),
  updateTask: (id: string, body: object): Promise<{ task: Task; entryId: string }> =>
    apiFetch(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  completeTask: (id: string): Promise<{ task: Task; entryId: string }> =>
    apiFetch(`/api/tasks/${id}/complete`, { method: 'POST' }),
  cancelTask: (id: string): Promise<{ task: Task; entryId: string }> =>
    apiFetch(`/api/tasks/${id}/cancel`, { method: 'POST' }),
  deleteTask: (id: string): Promise<{ entryId: string }> =>
    apiFetch(`/api/tasks/${id}`, { method: 'DELETE' }),
  getAreas: (): Promise<Area[]> => apiFetch('/api/areas'),
  getProjects: (): Promise<Project[]> => apiFetch('/api/projects'),
  getTags: (): Promise<Tag[]> => apiFetch('/api/tags'),
  getLog: (params?: { limit?: number; offset?: number }): Promise<{ entries: ChangeEntry[]; total: number }> => {
    const q = params
      ? '?' + new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString()
      : '';
    return apiFetch(`/api/log${q}`);
  },
  undo: (entryId: string): Promise<{ entryId: string }> =>
    apiFetch(`/api/undo/${entryId}`, { method: 'POST' }),
};

// ---- App ----

export default function App() {
  const [view, setView] = useState<View>('inbox');
  const [areas, setAreas] = useState<Area[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.getAreas(), api.getProjects(), api.getTags()])
      .then(([a, p, t]) => { setAreas(a); setProjects((p as Project[]).filter((proj) => proj.status !== 3 && !proj.trashed)); setTags(t); })
      .catch((e) => setError(String(e)));
  }, []);

  const loadTasks = useCallback(async (v: View) => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (v === 'inbox') params.status = 'inbox';
      else if (v === 'today') params.status = 'today';
      else if (v === 'upcoming') params.status = 'upcoming';
      else if (v === 'someday') params.status = 'someday';
      else if (v === 'logbook') params.status = 'completed';
      else if (typeof v === 'object' && v.type === 'project') params.projectId = v.id;
      else if (typeof v === 'object' && v.type === 'area') params.areaId = v.id;
      else if (typeof v === 'object' && v.type === 'tag') params.tag = v.name;
      let result = await api.getTasks(params);
      // Project/area/tag views have no explicit status filter — exclude completed/canceled/trash
      if (typeof v === 'object') {
        result = result.filter((t) => t.status !== 'completed' && t.status !== 'canceled' && t.status !== 'trash');
      }
      setTasks(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTasks(view); }, [view, loadTasks]);

  const addToast = (message: string, entryId: string) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, entryId }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  };

  const handleUndo = async (toast: Toast) => {
    try {
      await api.undo(toast.entryId);
      setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      loadTasks(view);
    } catch (e) { setError(String(e)); }
  };

  const handleComplete = async (task: Task) => {
    try {
      const res = await api.completeTask(task.id);
      addToast(`Completed "${task.title}"`, res.entryId);
      if (selectedTask?.id === task.id) setSelectedTask(null);
      loadTasks(view);
    } catch (e) { setError(String(e)); }
  };

  const handleCancel = async (task: Task) => {
    try {
      const res = await api.cancelTask(task.id);
      addToast(`Cancelled "${task.title}"`, res.entryId);
      if (selectedTask?.id === task.id) setSelectedTask(null);
      loadTasks(view);
    } catch (e) { setError(String(e)); }
  };

  const handleDelete = async (task: Task) => {
    try {
      const res = await api.deleteTask(task.id);
      addToast(`Deleted "${task.title}"`, res.entryId);
      if (selectedTask?.id === task.id) setSelectedTask(null);
      loadTasks(view);
    } catch (e) { setError(String(e)); }
  };

  const handleUpdate = async (id: string, updates: object) => {
    try {
      const res = await api.updateTask(id, updates);
      addToast('Task updated', res.entryId);
      setTasks((prev) => prev.map((t) => (t.id === id ? res.task : t)));
      if (selectedTask?.id === id) setSelectedTask(res.task);
    } catch (e) { setError(String(e)); }
  };

  const viewLabel = (v: View): string => {
    if (v === 'inbox') return 'Inbox';
    if (v === 'today') return 'Today';
    if (v === 'upcoming') return 'Upcoming';
    if (v === 'someday') return 'Someday';
    if (v === 'logbook') return 'Logbook';
    if (typeof v === 'object' && v.type === 'project') return projects.find((p) => p.uuid === v.id)?.title ?? v.id;
    if (typeof v === 'object' && v.type === 'area') return areas.find((a) => a.uuid === v.id)?.title ?? v.id;
    if (typeof v === 'object' && v.type === 'tag') return `#${v.name}`;
    return '';
  };

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar
        view={view}
        setView={(v) => { setView(v); setSelectedTask(null); }}
        areas={areas}
        projects={projects}
        tags={tags}
        onHistory={() => setHistoryOpen(true)}
      />
      <main style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <TaskList
          title={viewLabel(view)}
          tasks={tasks}
          loading={loading}
          error={error}
          selectedId={selectedTask?.id ?? null}
          onSelect={setSelectedTask}
          onComplete={handleComplete}
          onCancel={handleCancel}
          onDelete={handleDelete}
        />
        {selectedTask && (
          <TaskDetail
            task={selectedTask}
            onClose={() => setSelectedTask(null)}
            onUpdate={handleUpdate}
            onComplete={handleComplete}
            onCancel={handleCancel}
            onDelete={handleDelete}
          />
        )}
      </main>
      <div style={{ position: 'fixed', bottom: 24, right: 24, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 1000 }}>
        {toasts.map((toast) => (
          <ToastNotification
            key={toast.id}
            toast={toast}
            onUndo={handleUndo}
            onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
          />
        ))}
      </div>
      {historyOpen && (
        <HistoryDrawer
          onClose={() => setHistoryOpen(false)}
          onUndo={async (entryId) => { await api.undo(entryId); loadTasks(view); }}
        />
      )}
    </div>
  );
}

// ---- Sidebar ----

function Sidebar({
  view, setView, areas, projects, tags, onHistory,
}: {
  view: View;
  setView: (v: View) => void;
  areas: Area[];
  projects: Project[];
  tags: Tag[];
  onHistory: () => void;
}) {
  const [expandedAreas, setExpandedAreas] = useState<Set<string>>(new Set());
  const isActive = (v: View) => JSON.stringify(view) === JSON.stringify(v);

  const navBtn = (label: string, v: View, icon: string) => (
    <button
      key={JSON.stringify(v)}
      onClick={() => setView(v)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, width: '100%',
        padding: '6px 12px', background: isActive(v) ? '#e0e0e8' : 'transparent',
        border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14,
        color: '#1c1c1e', textAlign: 'left',
      }}
    >
      <span style={{ width: 20, textAlign: 'center' }}>{icon}</span> {label}
    </button>
  );

  return (
    <aside style={{
      width: 220, background: '#f2f2f7', borderRight: '1px solid #d1d1d6',
      display: 'flex', flexDirection: 'column', padding: '16px 8px', overflowY: 'auto',
    }}>
      <div style={{ marginBottom: 8 }}>
        {navBtn('Inbox', 'inbox', '📥')}
        {navBtn('Today', 'today', '⭐')}
        {navBtn('Upcoming', 'upcoming', '📅')}
        {navBtn('Someday', 'someday', '☁️')}
        {navBtn('Logbook', 'logbook', '✅')}
      </div>

      {projects.filter((p) => !p.area_id).length > 0 && (
        <div style={{ marginTop: 8 }}>
          {projects.filter((p) => !p.area_id).map((proj) => navBtn(proj.title, { type: 'project', id: proj.uuid }, '📋'))}
        </div>
      )}

      {areas.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#8e8e93', padding: '4px 12px', textTransform: 'uppercase', letterSpacing: 0.5 }}>Areas</div>
          {areas.map((area) => {
            const areaProjects = projects.filter((p) => p.area_id === area.uuid);
            const expanded = expandedAreas.has(area.uuid);
            const areaView: View = { type: 'area', id: area.uuid };
            return (
              <div key={area.uuid}>
                <button
                  onClick={() => {
                    setExpandedAreas((prev) => {
                      const next = new Set(prev);
                      expanded ? next.delete(area.uuid) : next.add(area.uuid);
                      return next;
                    });
                    setView(areaView);
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    padding: '6px 12px', background: isActive(areaView) ? '#e0e0e8' : 'transparent',
                    border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14,
                    color: '#1c1c1e', textAlign: 'left',
                  }}
                >
                  <span style={{ width: 20, textAlign: 'center' }}>{expanded ? '▾' : '▸'}</span>
                  {area.title}
                </button>
                {expanded && areaProjects.map((proj) => {
                  const projView: View = { type: 'project', id: proj.uuid };
                  return (
                    <button
                      key={proj.uuid}
                      onClick={() => setView(projView)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                        padding: '6px 12px 6px 32px',
                        background: isActive(projView) ? '#e0e0e8' : 'transparent',
                        border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14,
                        color: '#1c1c1e', textAlign: 'left',
                      }}
                    >
                      <span style={{ width: 16, textAlign: 'center' }}>📋</span> {proj.title}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {tags.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#8e8e93', padding: '4px 12px', textTransform: 'uppercase', letterSpacing: 0.5 }}>Tags</div>
          {tags.map((tag) => navBtn(`#${tag.title}`, { type: 'tag', name: tag.title }, '🏷️'))}
        </div>
      )}

      <div style={{ marginTop: 'auto', paddingTop: 16, borderTop: '1px solid #d1d1d6', marginTop: 16 }}>
        <button
          onClick={onHistory}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%',
            padding: '6px 12px', background: 'transparent', border: 'none',
            borderRadius: 6, cursor: 'pointer', fontSize: 14, color: '#636366', textAlign: 'left',
          }}
        >
          <span style={{ width: 20, textAlign: 'center' }}>🕐</span> History
        </button>
      </div>
    </aside>
  );
}

// ---- TaskList ----

function TaskList({
  title, tasks, loading, error, selectedId, onSelect, onComplete, onCancel, onDelete,
}: {
  title: string;
  tasks: Task[];
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  onSelect: (task: Task) => void;
  onComplete: (task: Task) => void;
  onCancel: (task: Task) => void;
  onDelete: (task: Task) => void;
}) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '20px 24px 12px', borderBottom: '1px solid #e5e5ea' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1c1c1e' }}>{title}</h1>
        <div style={{ fontSize: 13, color: '#8e8e93', marginTop: 2 }}>{tasks.length} tasks</div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {loading && <div style={{ padding: '24px', textAlign: 'center', color: '#8e8e93' }}>Loading…</div>}
        {error && <div style={{ padding: '24px', color: '#ff3b30' }}>{error}</div>}
        {!loading && !error && tasks.length === 0 && (
          <div style={{ padding: '48px 24px', textAlign: 'center', color: '#8e8e93' }}>No tasks</div>
        )}
        {tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            selected={task.id === selectedId}
            onClick={() => onSelect(task)}
            onComplete={onComplete}
            onCancel={onCancel}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}

// ---- TaskRow ----

function TaskRow({
  task, selected, onClick, onComplete, onCancel, onDelete,
}: {
  task: Task;
  selected: boolean;
  onClick: () => void;
  onComplete: (t: Task) => void;
  onCancel: (t: Task) => void;
  onDelete: (t: Task) => void;
}) {
  const [hover, setHover] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', padding: '10px 24px',
        cursor: 'pointer', background: selected ? '#e0e0e8' : hover ? '#f9f9fb' : 'transparent',
        borderBottom: '1px solid #f2f2f7',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 500, color: '#1c1c1e', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {task.title}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 3, flexWrap: 'wrap', alignItems: 'center' }}>
          {task.projectTitle && <span style={{ fontSize: 12, color: '#636366' }}>{task.projectTitle}</span>}
          {task.deadline && <span style={{ fontSize: 12, color: '#ff3b30' }}>⚑ {task.deadline.slice(0, 10)}</span>}
          {task.tags.map((tag) => (
            <span key={tag} style={{ fontSize: 11, background: '#e8e8ed', padding: '1px 6px', borderRadius: 10, color: '#636366' }}>
              {tag}
            </span>
          ))}
        </div>
      </div>
      {hover && (
        <div style={{ display: 'flex', gap: 4, marginLeft: 8 }} onClick={(e) => e.stopPropagation()}>
          {task.status !== 'completed' && (
            <ActionBtn label="✓" title="Complete" onClick={() => onComplete(task)} color="#34c759" />
          )}
          {task.status !== 'canceled' && (
            <ActionBtn label="✕" title="Cancel" onClick={() => onCancel(task)} color="#ff9500" />
          )}
          <ActionBtn label="🗑" title="Delete" onClick={() => onDelete(task)} color="#ff3b30" />
        </div>
      )}
    </div>
  );
}

function ActionBtn({ label, title, onClick, color }: { label: string; title: string; onClick: () => void; color: string }) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        width: 28, height: 28, border: 'none', borderRadius: 6,
        background: color + '22', color, cursor: 'pointer', fontSize: 14,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {label}
    </button>
  );
}

// ---- TaskDetail ----

function TaskDetail({
  task, onClose, onUpdate, onComplete, onCancel, onDelete,
}: {
  task: Task;
  onClose: () => void;
  onUpdate: (id: string, updates: object) => void;
  onComplete: (t: Task) => void;
  onCancel: (t: Task) => void;
  onDelete: (t: Task) => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? '');
  const [deadline, setDeadline] = useState(task.deadline?.slice(0, 10) ?? '');
  const [whenDate, setWhenDate] = useState(task.whenDate?.slice(0, 10) ?? '');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setTitle(task.title);
    setNotes(task.notes ?? '');
    setDeadline(task.deadline?.slice(0, 10) ?? '');
    setWhenDate(task.whenDate?.slice(0, 10) ?? '');
    setDirty(false);
  }, [task.id]);

  const handleSave = () => {
    onUpdate(task.id, { title, notes: notes || null, deadline: deadline || null, whenDate: whenDate || null });
    setDirty(false);
  };

  const inp = { width: '100%', padding: '8px 10px', border: '1px solid #d1d1d6', borderRadius: 8, fontSize: 14, background: '#fff', color: '#1c1c1e', outline: 'none' as const };

  return (
    <div style={{ width: 360, borderLeft: '1px solid #e5e5ea', display: 'flex', flexDirection: 'column', background: '#fff', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #e5e5ea' }}>
        <div style={{ flex: 1, fontSize: 16, fontWeight: 600, color: '#1c1c1e' }}>Task Details</div>
        <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 22, color: '#8e8e93', lineHeight: 1 }}>×</button>
      </div>

      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label="Title">
          <input value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} style={inp} />
        </Field>
        <Field label="Notes">
          <textarea
            value={notes}
            onChange={(e) => { setNotes(e.target.value); setDirty(true); }}
            rows={4}
            style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }}
          />
        </Field>
        <Field label="When">
          <input type="date" value={whenDate} onChange={(e) => { setWhenDate(e.target.value); setDirty(true); }} style={inp} />
        </Field>
        <Field label="Deadline">
          <input type="date" value={deadline} onChange={(e) => { setDeadline(e.target.value); setDirty(true); }} style={inp} />
        </Field>
        {task.tags.length > 0 && (
          <Field label="Tags">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {task.tags.map((tag) => (
                <span key={tag} style={{ fontSize: 13, background: '#e8e8ed', padding: '3px 10px', borderRadius: 12, color: '#636366' }}>{tag}</span>
              ))}
            </div>
          </Field>
        )}
        {task.projectTitle && <Field label="Project"><span style={{ fontSize: 14, color: '#3a3a3c' }}>{task.projectTitle}</span></Field>}
        {task.areaTitle && <Field label="Area"><span style={{ fontSize: 14, color: '#3a3a3c' }}>{task.areaTitle}</span></Field>}

        {dirty && (
          <button
            onClick={handleSave}
            style={{ width: '100%', padding: 10, background: '#007aff', color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
          >
            Save Changes
          </button>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          {task.status !== 'completed' && (
            <button onClick={() => onComplete(task)} style={{ flex: 1, padding: 8, background: '#34c75922', color: '#34c759', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Complete
            </button>
          )}
          {task.status !== 'canceled' && (
            <button onClick={() => onCancel(task)} style={{ flex: 1, padding: 8, background: '#ff950022', color: '#ff9500', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Cancel
            </button>
          )}
          <button onClick={() => onDelete(task)} style={{ flex: 1, padding: 8, background: '#ff3b3022', color: '#ff3b30', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Delete
          </button>
        </div>

        <div style={{ fontSize: 12, color: '#8e8e93', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span>Created: {new Date(task.createdAt).toLocaleString()}</span>
          <span>Modified: {new Date(task.modifiedAt).toLocaleString()}</span>
          {task.completedAt && <span>Completed: {new Date(task.completedAt).toLocaleString()}</span>}
          {task.canceledAt && <span>Cancelled: {new Date(task.canceledAt).toLocaleString()}</span>}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#8e8e93', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

// ---- Toast ----

function ToastNotification({
  toast, onUndo, onDismiss,
}: {
  toast: Toast;
  onUndo: (toast: Toast) => void;
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      style={{
        background: '#1c1c1e', color: '#fff', padding: '12px 16px',
        borderRadius: 12, display: 'flex', alignItems: 'center', gap: 12,
        boxShadow: '0 4px 20px rgba(0,0,0,0.25)', fontSize: 14,
        animation: 'slideUp 0.2s ease',
      }}
    >
      <span style={{ flex: 1 }}>{toast.message}</span>
      <button
        onClick={() => onUndo(toast)}
        style={{ background: '#fff', color: '#1c1c1e', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}
      >
        Undo
      </button>
      <button
        onClick={() => onDismiss(toast.id)}
        style={{ background: 'transparent', color: '#8e8e93', border: 'none', cursor: 'pointer', fontSize: 20, padding: 0, lineHeight: 1 }}
      >
        ×
      </button>
    </div>
  );
}

// ---- HistoryDrawer ----

function HistoryDrawer({
  onClose, onUndo,
}: {
  onClose: () => void;
  onUndo: (entryId: string) => Promise<void>;
}) {
  const [entries, setEntries] = useState<ChangeEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const LIMIT = 20;

  const load = useCallback(async (o: number) => {
    try {
      const res = await api.getLog({ limit: LIMIT, offset: o });
      setEntries(res.entries);
      setTotal(res.total);
      setOffset(o);
    } catch (e) {
      console.error('Failed to load history:', e);
    }
  }, []);

  useEffect(() => { load(0); }, [load]);

  const opLabel: Record<string, string> = {
    create: '➕ Created',
    update: '✏️ Updated',
    complete: '✅ Completed',
    cancel: '✕ Cancelled',
    delete: '🗑 Deleted',
    undo: '↩️ Undone',
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 900, display: 'flex', justifyContent: 'flex-end' }}
      onClick={onClose}
    >
      <div
        style={{ width: 400, background: '#fff', height: '100%', display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 20px rgba(0,0,0,0.1)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', padding: '20px 20px 16px', borderBottom: '1px solid #e5e5ea' }}>
          <h2 style={{ flex: 1, fontSize: 20, fontWeight: 700, color: '#1c1c1e' }}>Change History</h2>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 24, color: '#8e8e93', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {entries.length === 0 && (
            <div style={{ padding: '48px 20px', textAlign: 'center', color: '#8e8e93' }}>No changes yet</div>
          )}
          {entries.map((entry) => (
            <div key={entry.id} style={{ padding: '12px 20px', borderBottom: '1px solid #f2f2f7', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#1c1c1e' }}>
                  {opLabel[entry.operation] ?? entry.operation}
                </div>
                <div style={{ fontSize: 13, color: '#636366', marginTop: 2 }}>
                  {(entry.after ?? entry.before)?.title ?? entry.taskId}
                </div>
                <div style={{ fontSize: 12, color: '#8e8e93', marginTop: 2 }}>
                  {new Date(entry.createdAt).toLocaleString()}
                </div>
                {entry.undoneAt && (
                  <div style={{ fontSize: 12, color: '#ff9500', marginTop: 2 }}>
                    ↩️ Undone {new Date(entry.undoneAt).toLocaleString()}
                  </div>
                )}
              </div>
              {!entry.undoneAt && entry.operation !== 'undo' && (
                <button
                  onClick={async () => { await onUndo(entry.id); load(offset); }}
                  style={{ padding: '4px 10px', background: '#007aff22', color: '#007aff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}
                >
                  Undo
                </button>
              )}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', borderTop: '1px solid #e5e5ea' }}>
          <button
            disabled={offset === 0}
            onClick={() => load(Math.max(0, offset - LIMIT))}
            style={{ padding: '6px 14px', border: '1px solid #d1d1d6', borderRadius: 8, cursor: offset === 0 ? 'default' : 'pointer', background: '#fff', color: offset === 0 ? '#c7c7cc' : '#1c1c1e', fontSize: 13 }}
          >
            ← Newer
          </button>
          <span style={{ fontSize: 13, color: '#8e8e93' }}>
            {total === 0 ? '0 changes' : `${Math.min(offset + 1, total)}–${Math.min(offset + LIMIT, total)} of ${total}`}
          </span>
          <button
            disabled={offset + LIMIT >= total}
            onClick={() => load(offset + LIMIT)}
            style={{ padding: '6px 14px', border: '1px solid #d1d1d6', borderRadius: 8, cursor: offset + LIMIT >= total ? 'default' : 'pointer', background: '#fff', color: offset + LIMIT >= total ? '#c7c7cc' : '#1c1c1e', fontSize: 13 }}
          >
            Older →
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Mount ----
initToken().then(() => {
  const root = createRoot(document.getElementById('root')!);
  root.render(<App />);
});
