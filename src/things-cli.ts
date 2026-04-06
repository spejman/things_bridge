import type { Task, CreateTaskPayload, UpdateTaskPayload } from './shared/index.ts';
import { TASK_STATUS } from './shared/index.ts';

const BRIDGE_ID_PREFIX = 'BridgeID:';

const THINGS_STATUS = { OPEN: 0, CANCELED: 2, COMPLETED: 3 } as const;

export type CliRunner = (args: string[]) => Promise<string>;

async function defaultRunner(args: string[]): Promise<string> {
  const env = { ...process.env };
  const proc = Bun.spawn(['things', ...args], { stdout: 'pipe', stderr: 'pipe', env });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const err = await new Response(proc.stderr).text();
    if (err.includes('auth token')) {
      throw new Error(
        'Things auth token missing — write operations require THINGS_AUTH_TOKEN. ' +
        'Set it in .env, pass --things-auth-token to the CLI, or run `things auth`. ' +
        'Find the token in Things 3 > Settings > General > Things URLs.'
      );
    }
    throw new Error(`things3-cli failed: ${err}`);
  }
  return await new Response(proc.stdout).text();
}

export function mapThingsTaskToTask(t: any): Task {
  let status: Task['status'] = TASK_STATUS.ANYTIME;

  if (t.trashed === true) {
    status = TASK_STATUS.TRASH;
  } else if (t.status === THINGS_STATUS.COMPLETED) {
    status = TASK_STATUS.COMPLETED;
  } else if (t.status === THINGS_STATUS.CANCELED) {
    status = TASK_STATUS.CANCELED;
  } else if (t.start === 'Inbox') {
    status = TASK_STATUS.INBOX;
  } else if (t.start === 'Someday') {
    status = TASK_STATUS.SOMEDAY;
  } else if (t.start === 'Anytime' && t.start_date) {
    const today = new Date().toISOString().slice(0, 10);
    status = t.start_date > today ? TASK_STATUS.UPCOMING : TASK_STATUS.TODAY;
  }

  const isCompleted = t.status === THINGS_STATUS.COMPLETED;
  const isCanceled = t.status === THINGS_STATUS.CANCELED;

  return {
    id: t.uuid,
    title: t.title,
    notes: t.notes || null,
    status,
    projectId: t.project_id || null,
    projectTitle: t.project_title || null,
    areaId: t.area_id || null,
    areaTitle: t.area_title || null,
    tags: t.tags || [],
    checklistItems: [],
    deadline: t.deadline || null,
    whenDate: t.start_date || null,
    createdAt: toIso(t.created) ?? new Date().toISOString(),
    modifiedAt: toIso(t.modified) ?? new Date().toISOString(),
    completedAt: isCompleted ? toIso(t.stop_date) : null,
    canceledAt: isCanceled ? toIso(t.stop_date) : null,
  };
}

function toIso(d: string | null | undefined): string | null {
  if (!d) return null;
  return d.replace(' ', 'T') + 'Z';
}

export class ThingsCliService {
  constructor(private run: CliRunner = defaultRunner) {}

  async getSnapshot(): Promise<Task[]> {
    const json = await this.run(['tasks', '--json', '--all', '--recursive', '--limit=0']);
    return JSON.parse(json).map(mapThingsTaskToTask);
  }

  async getTaskById(id: string): Promise<Task | null> {
    const tasks = await this.getSnapshot();
    return tasks.find((t) => t.id === id) ?? null;
  }

  async getAreas(): Promise<unknown[]> {
    const json = await this.run(['areas', '--json']);
    return JSON.parse(json);
  }

  async getProjects(): Promise<unknown[]> {
    const json = await this.run(['projects', '--json', '--all']);
    return JSON.parse(json);
  }

  async getTags(): Promise<unknown[]> {
    const json = await this.run(['tags', '--json']);
    return JSON.parse(json);
  }

  async getRawTasks(): Promise<unknown[]> {
    const json = await this.run(['tasks', '--json', '--all', '--recursive', '--limit=0']);
    return JSON.parse(json);
  }

  async createTask(payload: CreateTaskPayload): Promise<string> {
    const bridgeId = `${BRIDGE_ID_PREFIX}${crypto.randomUUID()}`;
    const notes = payload.notes ? `${payload.notes}\n\n${bridgeId}` : bridgeId;
    const args = ['add', payload.title, '--notes', notes];

    if (payload.when) args.push('--when', payload.when);
    else if (payload.whenDate) args.push('--when', payload.whenDate);
    if (payload.deadline) args.push('--deadline', payload.deadline);
    if (payload.tags?.length) args.push('--tags', payload.tags.join(','));
    if (payload.checklistItems?.length) {
      for (const item of payload.checklistItems) args.push('--checklist-item', item.title);
    }
    if (payload.projectId) args.push('--list-id', payload.projectId);
    if (payload.areaId) args.push('--area-id', payload.areaId);

    await this.run(args);

    const tasks = await this.getSnapshot();
    const task = tasks.find((t) => t.notes?.includes(bridgeId));
    if (!task) throw new Error(`Could not find task with BridgeID after creation`);
    return task.id;
  }

  async updateTask(id: string, payload: Partial<UpdateTaskPayload>): Promise<void> {
    const args = ['update', `--id=${id}`];
    if (payload.title !== undefined) args.push(payload.title);
    if (payload.notes !== undefined) args.push(`--notes=${payload.notes}`);
    if (payload.projectId !== undefined) args.push(`--list-id=${payload.projectId}`);
    else if (payload.areaId !== undefined) args.push(`--list-id=${payload.areaId}`);
    if (payload.whenDate !== undefined) args.push(`--when=${payload.whenDate ?? ''}`);
    else if (payload.when !== undefined) args.push(`--when=${payload.when ?? ''}`);
    if (payload.deadline !== undefined) args.push(`--deadline=${payload.deadline ?? ''}`);
    if (payload.completed === true) args.push('--completed');
    if (payload.completed === false) args.push('--completed=false');
    await this.run(args);
  }

  async completeTask(id: string): Promise<void> {
    await this.run(['update', `--id=${id}`, '--completed']);
  }

  async cancelTask(id: string): Promise<void> {
    await this.run(['update', `--id=${id}`, '--canceled']);
  }

  async deleteTask(id: string): Promise<void> {
    await this.run(['delete', `--id=${id}`, `--confirm=${id}`]);
  }

  async recreateTask(task: Task): Promise<string> {
    return this.createTask({
      title: task.title,
      notes: task.notes ?? undefined,
      projectId: task.projectId ?? undefined,
      areaId: task.areaId ?? undefined,
      tags: task.tags,
      deadline: task.deadline ?? undefined,
      whenDate: task.whenDate ?? undefined,
    });
  }
}
