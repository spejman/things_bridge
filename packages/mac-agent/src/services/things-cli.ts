import type {
  Task,
  CreateTaskPayload,
  UpdateTaskPayload,
  CancelTaskPayload,
} from '@things-bridge/shared';
import { BRIDGE_ID_PREFIX, TASK_STATUS } from '@things-bridge/shared';

const THINGS_LIST_NAMES = new Set(['Today', 'Upcoming', 'Someday']);

export class ThingsCliService {
  private async runThingsCli(args: string[]): Promise<string> {
    const proc = Bun.spawn(['things', ...args], {
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      const errorText = await new Response(proc.stderr).text();
      throw new Error(`things CLI failed: ${errorText}`);
    }

    return await new Response(proc.stdout).text();
  }

  async createTask(payload: CreateTaskPayload): Promise<string> {
    const bridgeId = `${BRIDGE_ID_PREFIX}${crypto.randomUUID()}`;
    const notes = payload.notes ? `${payload.notes}\n\n${bridgeId}` : bridgeId;

    const args: string[] = ['add', payload.title, '--notes', notes];

    if (payload.when) {
      args.push('--when', payload.when);
    } else if (payload.whenDate) {
      args.push('--when', payload.whenDate);
    }

    if (payload.deadline) {
      args.push('--deadline', payload.deadline);
    }

    if (payload.tags && payload.tags.length > 0) {
      args.push('--tags', payload.tags.join(','));
    }

    if (payload.checklistItems && payload.checklistItems.length > 0) {
      for (const item of payload.checklistItems) {
        args.push('--checklist-item', item.title);
      }
    }

    if (payload.projectId) {
      args.push('--list-id', payload.projectId);
    }

    if (payload.areaId) {
      args.push('--area-id', payload.areaId);
    }

    await this.runThingsCli(args);

    const thingsId = await this.findTaskByBridgeId(bridgeId);

    if (!thingsId) {
      throw new Error(`Could not find task with BridgeID: ${bridgeId}`);
    }

    return thingsId;
  }

  async updateTask(thingsId: string, payload: UpdateTaskPayload): Promise<void> {
    const args: string[] = ['update', thingsId];

    if (payload.title !== undefined) {
      args.push('--title', payload.title);
    }

    if (payload.notes !== undefined) {
      args.push('--notes', payload.notes);
    }

    if (payload.when !== undefined) {
      if (payload.when === null) {
        args.push('--when', '');
      } else {
        args.push('--when', payload.when);
      }
    } else if (payload.whenDate !== undefined) {
      if (payload.whenDate === null) {
        args.push('--when', '');
      } else {
        args.push('--when', payload.whenDate);
      }
    }

    if (payload.deadline !== undefined) {
      if (payload.deadline === null) {
        args.push('--deadline', '');
      } else {
        args.push('--deadline', payload.deadline);
      }
    }

    if (payload.completed !== undefined) {
      args.push('--completed', payload.completed ? 'true' : 'false');
    }

    await this.runThingsCli(args);
  }

  async cancelTask(payload: CancelTaskPayload): Promise<void> {
    await this.runThingsCli(['cancel', payload.thingsId]);
  }

  async getAreas(): Promise<unknown[]> {
    const jsonText = await this.runThingsCli(['areas', '--json']);
    return JSON.parse(jsonText);
  }

  async getProjects(): Promise<unknown[]> {
    const jsonText = await this.runThingsCli(['projects', '--json', '--all', '--recursive']);
    return JSON.parse(jsonText);
  }

  async getTags(): Promise<unknown[]> {
    const jsonText = await this.runThingsCli(['tags', '--json']);
    return JSON.parse(jsonText);
  }

  async getAllTasks(): Promise<unknown[]> {
    const jsonText = await this.runThingsCli(['tasks', '--json', '--all', '--recursive', '--limit=0']);
    return JSON.parse(jsonText);
  }

  async getSnapshot(): Promise<Task[]> {
    const jsonText = await this.runThingsCli(['show', '--json', '--include-items']);
    const thingsTasks = JSON.parse(jsonText);

    return thingsTasks.map((thingsTask: any) => this.mapThingsTaskToTask(thingsTask));
  }

  private async findTaskByBridgeId(bridgeId: string): Promise<string | null> {
    const snapshot = await this.getSnapshot();

    for (const task of snapshot) {
      if (task.notes && task.notes.includes(bridgeId)) {
        return task.id;
      }
    }

    return null;
  }

  private mapThingsTaskToTask(thingsTask: any): Task {
    const tags = thingsTask.tags || [];
    const checklistItems = (thingsTask.items || []).map((item: any) => ({
      title: item.title,
      completed: item.status === 'completed',
    }));

    let status: Task['status'] = TASK_STATUS.INBOX;
    if (thingsTask.status === 'completed') {
      status = TASK_STATUS.COMPLETED;
    } else if (thingsTask.status === 'canceled') {
      status = TASK_STATUS.CANCELED;
    } else if (thingsTask.type === 'to-do' && thingsTask.area === 'Today') {
      status = TASK_STATUS.TODAY;
    } else if (thingsTask.type === 'to-do' && thingsTask.area === 'Upcoming') {
      status = TASK_STATUS.UPCOMING;
    } else if (thingsTask.type === 'to-do' && thingsTask.area === 'Someday') {
      status = TASK_STATUS.SOMEDAY;
    }

    const areaId = THINGS_LIST_NAMES.has(thingsTask.area) ? null : (thingsTask.area || null);

    return {
      id: thingsTask.uuid,
      title: thingsTask.title,
      notes: thingsTask.notes || null,
      status,
      projectId: thingsTask.project || null,
      areaId,
      tags,
      checklistItems,
      deadline: thingsTask.deadline || null,
      whenDate: thingsTask['start-date'] || thingsTask['scheduled-date'] || null,
      createdAt: thingsTask['creation-date'] || new Date().toISOString(),
      modifiedAt: thingsTask['modification-date'] || new Date().toISOString(),
      completedAt: thingsTask['completion-date'] || null,
      canceledAt: thingsTask['cancellation-date'] || null,
    };
  }
}
