// Вхід через SSO (sso.fineko.space) — той самий паттерн, що ORG (`apps/web/app/auth/sso/*`):
// authorization-code редирект → server-to-server обмін коду на access_token+user на SSO →
// власна сесійна cookie тут (НЕ шаримо JWT_SECRET з SSO — так само роблять ORG і content2).
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { Router } from 'express';

const SSO_URL = process.env.SSO_URL || 'http://localhost:4600';
const CLIENT_ID = process.env.EDITS_SSO_CLIENT_ID || '';
const CLIENT_SECRET = process.env.EDITS_SSO_CLIENT_SECRET || '';
const BASE_URL = process.env.BASE_URL || 'http://localhost:4700';
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev_edits_session_secret_change_me';
const SESSION_TTL = 60 * 60 * 24 * 30; // 30 днів, як у SSO

const SECURE_COOKIES = BASE_URL.startsWith('https://');
const STATE_COOKIE = { httpOnly: true, sameSite: 'lax' as const, secure: SECURE_COOKIES, maxAge: 5 * 60 * 1000 };
const SESSION_COOKIE = { httpOnly: true, sameSite: 'lax' as const, secure: SECURE_COOKIES, maxAge: SESSION_TTL * 1000 };

export type SessionUser = { userId: string; email: string; name: string };

function issueSession(user: SessionUser): string {
  return jwt.sign(user, SESSION_SECRET, { expiresIn: SESSION_TTL });
}

function verifySession(token: string): SessionUser | null {
  try {
    return jwt.verify(token, SESSION_SECRET) as SessionUser;
  } catch {
    return null;
  }
}

export function currentUser(req: Request): SessionUser | null {
  const token = req.cookies?.edits_session;
  if (!token) return null;
  return verifySession(String(token));
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const user = currentUser(req);
  if (!user) {
    if (req.path.startsWith('/api/')) return void res.status(401).json({ ok: false, error: 'Unauthorized' });
    return void res.redirect('/auth/sso');
  }
  (req as Request & { user: SessionUser }).user = user;
  next();
}

export const authRouter = Router();

authRouter.get('/auth/sso', (req: Request, res: Response) => {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return void res.status(500).send('SSO-клієнт не налаштований: заповни EDITS_SSO_CLIENT_ID/SECRET у .env (див. .env.example)');
  }
  const state = randomUUID();
  res.cookie('edits_sso_state', state, STATE_COOKIE);
  const redirectUri = `${BASE_URL}/auth/sso/callback`;
  const url = new URL(`${SSO_URL}/authorize`);
  url.searchParams.set('client_id', CLIENT_ID);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', state);
  res.redirect(url.toString());
});

authRouter.get('/auth/sso/callback', async (req: Request, res: Response) => {
  const { code, state } = req.query as { code?: string; state?: string };
  const expectedState = req.cookies?.edits_sso_state;
  res.clearCookie('edits_sso_state');
  if (!code || !state || !expectedState || state !== expectedState) {
    return void res.status(400).send('Невалідний state — спробуй увійти ще раз: /auth/sso');
  }
  try {
    const redirectUri = `${BASE_URL}/auth/sso/callback`;
    const tokenRes = await fetch(`${SSO_URL}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenRes.ok) {
      return void res.status(502).send(`SSO відхилив обмін коду: ${tokenRes.status}`);
    }
    const data = (await tokenRes.json()) as { user?: { id: string; email: string; name?: string } };
    if (!data.user?.id || !data.user?.email) {
      return void res.status(502).send('SSO не повернув дані користувача');
    }
    const sessionUser: SessionUser = { userId: data.user.id, email: data.user.email, name: data.user.name || data.user.email };
    res.cookie('edits_session', issueSession(sessionUser), SESSION_COOKIE);
    res.redirect('/edits');
  } catch (err) {
    console.error('[auth] sso callback error', err);
    res.status(502).send('Не вдалось зв\'язатись з SSO');
  }
});

authRouter.post('/auth/logout', (_req: Request, res: Response) => {
  res.clearCookie('edits_session');
  res.json({ ok: true });
});

authRouter.get('/auth/logout', (_req: Request, res: Response) => {
  res.clearCookie('edits_session');
  res.redirect('/auth/sso');
});
