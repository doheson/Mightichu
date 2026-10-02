import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  // 워크스페이스 패키지를 소스 그대로 쓴다 (빌드 단계 없음)
  optimizeDeps: { exclude: ['@mightichu/core', '@mightichu/mighty', '@mightichu/bots'] },
});
