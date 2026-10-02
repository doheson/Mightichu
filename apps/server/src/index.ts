/** 부팅 진입점. 서버 구성은 `app.ts` 에 있다. */

import { createApp } from './app.js';

const PORT = Number(process.env['PORT'] ?? 3001);
const ORIGIN = process.env['CORS_ORIGIN'] ?? '*';

const app = createApp(ORIGIN);
app.http.listen(PORT, () => {
  process.stdout.write(`mightichu server on :${PORT}\n`);
});
