import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { app } from './app.js';

const port = Number(process.env.PORT ?? 3001);
const dist = path.resolve('dist');

// `npm start` serves the built app from the same origin; `npm run dev` lets Vite serve it on :5173.
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(port, () => console.log(`[api] listening on http://localhost:${port}`));
