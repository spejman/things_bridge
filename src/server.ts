import type { Config } from './config.ts';
import type { ThingsCliService } from './things-cli.ts';
import type { ChangeLog } from './change-log.ts';
import { handleGetTasks, handleGetTask, handleGetAreas, handleGetProjects, handleGetTags } from './routes/tasks.ts';
import { handleCreateTask, handleUpdateTask, handleCompleteTask, handleCancelTask, handleDeleteTask } from './routes/mutations.ts';
import { handleGetLog, handleUndo } from './routes/log.ts';
import index from '../index.html';

export function createServer(config: Config, cli: ThingsCliService, changeLog: ChangeLog) {
  const { token } = config;

  return Bun.serve({
    port: config.port,
    routes: {
      '/': index,
      '/api/config': { GET: () => Response.json({ token: token }) },
      '/api/tasks': {
        GET: (req: Request) => handleGetTasks(req, cli, token),
        POST: (req: Request) => handleCreateTask(req, cli, changeLog, token),
      },
      '/api/tasks/:id': {
        GET: (req: any) => handleGetTask(req, cli, token),
        PATCH: (req: any) => handleUpdateTask(req, cli, changeLog, token),
        DELETE: (req: any) => handleDeleteTask(req, cli, changeLog, token),
      },
      '/api/tasks/:id/complete': {
        POST: (req: any) => handleCompleteTask(req, cli, changeLog, token),
      },
      '/api/tasks/:id/cancel': {
        POST: (req: any) => handleCancelTask(req, cli, changeLog, token),
      },
      '/api/areas': {
        GET: (req: Request) => handleGetAreas(req, cli, token),
      },
      '/api/projects': {
        GET: (req: Request) => handleGetProjects(req, cli, token),
      },
      '/api/tags': {
        GET: (req: Request) => handleGetTags(req, cli, token),
      },
      '/api/log': {
        GET: (req: Request) => handleGetLog(req, changeLog, token),
      },
      '/api/undo/:entryId': {
        POST: (req: any) => handleUndo(req, cli, changeLog, token),
      },
    },
    fetch() {
      return new Response('Not found', { status: 404 });
    },
  });
}
