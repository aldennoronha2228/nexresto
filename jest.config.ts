/**
 * jest.config.ts
 * Security test suite configuration.
 * Runs pure logic tests (no DOM, no Supabase network calls).
 */
import type { Config } from 'jest';

const config: Config = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testMatch: ['**/__tests__/**/*.test.ts'],
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/$1',
    },
    transform: {
        '^.+\\.tsx?$': ['ts-jest', {
            tsconfig: {
                // Relax for tests — avoids needing all Next.js types
                module: 'commonjs',
                esModuleInterop: true,
            },
        }],
    },
    coverageDirectory: 'coverage',
    collectCoverageFrom: [
        'lib/validate.ts',
        'lib/rateLimit.ts',
        'lib/logger.ts',
        'lib/env.ts',
    ],
};

export default config;
