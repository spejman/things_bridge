import type {
  Task,
  CreateTaskPayload,
  UpdateTaskPayload,
  CancelTaskPayload,
} from '@things-bridge/shared';
import { BRIDGE_ID_PREFIX } from '@things-bridge/shared';

export class ThingsCliService {
  async createTask(payload: CreateTaskPayload): Promise<string> {
    const bridgeId = `${BRIDGE_ID_PREFIX}${crypto.randomUUID()}`;
    const notes = payload.notes ? `${payload.notes}\n\n${bridgeId}` : bridgeId;

    const args: string[] = ['add', payload.title];

    if (notes) {
      args.push('--notes', notes);
    }

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

    const proc = Bun.spawn(['things', ...args], {
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      const errorText = await new Response(proc.stderr).text();
      throw new Error(`things CLI failed: ${errorText}`);
    }

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

    const proc = Bun.spawn(['things', ...args], {
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      const errorText = await new Response(proc.stderr).text();
      throw new Error(`things CLI update failed: ${errorText}`);
    }
  }

  async cancelTask(payload: CancelTaskPayload): Promise<void> {
    const proc = Bun.spawn(['things', 'cancel', payload.thingsId], {
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      const errorText = await new Response(proc.stderr).text();
      throw new Error(`things CLI cancel failed: ${errorText}`);
    }
  }

  async getSnapshot(): Promise<Task[]> {
    const proc = Bun.spawn(['things', 'show', '--json', '--include-items'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      const errorText = await new Response(proc.stderr).text();
      throw new Error(`things CLI show failed: ${errorText}`);
    }

    const jsonText = await new Response(proc.stdout).text();
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

    let status: Task['status'] = 'inbox';
    if (thingsTask.status === 'completed') {
      status = 'completed';
    } else if (thingsTask.status === 'canceled') {
      status = 'canceled';
    } else if (thingsTask.type === 'to-do' && thingsTask.area === 'Today') {
      status = 'today';
    } else if (thingsTask.type === 'to-do' && thingsTask.area === 'Upcoming') {
      status = 'upcoming';
    } else if (thingsTask.type === 'to-do' && thingsTask.area === 'Someday') {
      status = 'someday';
    }

    return {
      id: thingsTask.uuid,
      title: thingsTask.title,
      notes: thingsTask.notes || null,
      status,
      projectId: thingsTask.project || null,
      areaId: thingsTask.area || null,
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
