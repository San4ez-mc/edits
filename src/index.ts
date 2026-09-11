// Платформа аналізу правок FINEKO — внутрішній інструмент: збір скарг/правок (UI + API),
// категоризація (AI + agent-tools/MCP), аналітика динаміки. Свідомо простий сервіс —
// Express, без білду, без React/Next — за зразком SSO/Векторної бази.
import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import path from 'node:path';

import { authRouter, requireAuth, currentUser } from './auth';
import { editsRouter } from './routes/edits';
import { categoriesRouter } from './routes/categories';
import { analyticsRouter } from './routes/analytics';
import { agentToolsRouter } from './routes/agentTools';
import { mcpRouter } from './routes/mcp';
import { exportRouter } from './routes/exportRouter';
import { editsPage } from './pages/editsPage';
import { categoriesPage } from './pages/categoriesPage';
import { analyticsPage } from './pages/analyticsPage';
import { startCategorizerLoop } from './categorizer';
import { UPLOADS_DIR } from './upload';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(cors({ origin: true, credentials: true }));

const PORT = Number(process.env.PORT || 4700);

app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '7d' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use(authRouter);
app.use(editsRouter);
app.use(categoriesRouter);
app.use(analyticsRouter);
app.use(agentToolsRouter);
app.use(mcpRouter);
app.use(exportRouter);

app.get('/', (req, res) => res.redirect('/edits'));
app.get('/edits', requireAuth, (req, res) => res.type('html').send(editsPage(currentUser(req)!)));
app.get('/categories', requireAuth, (req, res) => res.type('html').send(categoriesPage(currentUser(req)!)));
app.get('/analytics', requireAuth, (req, res) => res.type('html').send(analyticsPage(currentUser(req)!)));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`[edits] listening on :${PORT}`);
  startCategorizerLoop();
});
