// Bearer/?token= перевірка для сервер-до-сервер ендпоінтів (ingest, agent-tools, mcp) —
// той самий паттерн, що WEBHOOK_SECRET/token у content2 agent-tools.
import type { Request, Response, NextFunction } from 'express';

function extractToken(req: Request): string {
  const header = req.header('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(header);
  if (m) return m[1].trim();
  return String(req.query.token || (req.body && req.body.token) || '');
}

export function requireToken(expected: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!expected) {
      return void res.status(500).json({ ok: false, error: 'Token not configured on server' });
    }
    if (extractToken(req) !== expected) {
      return void res.status(401).json({ ok: false, error: 'Unauthorized' });
    }
    next();
  };
}

// POST /api/edits обслуговує і зовнішній ingest (bearer-токен), і форму «+ Додати правку»
// у самому UI (SSO-сесія) — пускаємо, якщо валідне хоч одне з двох.
export function requireTokenOrSession(expected: string, hasSession: (req: Request) => boolean) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (hasSession(req)) return next();
    if (expected && extractToken(req) === expected) return next();
    res.status(401).json({ ok: false, error: 'Unauthorized' });
  };
}
