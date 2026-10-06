import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  /**
   * 프로젝트 페이지(`https://<user>.github.io/<repo>/`)로 올리면 자산 경로에
   * 저장소 이름이 붙어야 한다. 루트 도메인(Cloudflare Pages 등)에서는 '/'.
   */
  base: process.env['VITE_BASE'] ?? '/',
  plugins: [react()],
  server: { port: 5173 },
  // 워크스페이스 패키지를 소스 그대로 쓴다 (빌드 단계 없음)
  optimizeDeps: { exclude: ['@mightichu/core', '@mightichu/mighty', '@mightichu/bots'] },
});
