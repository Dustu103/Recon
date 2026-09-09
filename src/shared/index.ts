/**
 * @taro/shared — Public API
 *
 * Import rules:
 *   - apps/server, apps/cli, packages/core may import anything from here.
 *   - apps/web may import types and schemas (no Node-only deps here).
 *   - packages/shared must NEVER import from @taro/core or any app.
 */

// Error contracts
export { ErrorCode, TaroError } from './errors';
export type { ErrorCode as ErrorCodeType } from './errors';

export { genReqIds, genQIds, genFIds, genNextIds, nextOffsetFromIds } from './id-generator';

// Environment validation & loading
export {
  validateEnv,
  validateServerEnv,
  validateCliEnv,
  parseEnv,
  loadEnvFile,
  autoLoadEnv,
  parseEnvFileContent,
  _resetEnvCache,
} from './env';
export type { Env, ServerEnv, CliEnv } from './env';

// Appendix A & B schemas + TypeScript types
export * from './schemas/index';
