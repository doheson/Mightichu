import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts'],
    environment: 'node',
    /**
     * 기본 5초로는 부족하다.
     *
     * 봇 휴리스틱의 임계값을 **측정으로** 잡기 때문에, 한 테스트가
     * 수백 판을 자동 대국한다(티츄 선언 성공률 400판, 마이티 공약 400판 등).
     * 로컬에서는 몇 초지만 CI 러너는 훨씬 느리다.
     */
    testTimeout: 120_000,
    hookTimeout: 60_000,
  },
});
