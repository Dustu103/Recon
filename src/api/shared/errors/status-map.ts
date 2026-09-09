import { ErrorCode } from '@/shared';

/**
 * Maps Canonical Error Codes to appropriate HTTP response status codes.
 */
export function getHttpStatusForErrorCode(code: ErrorCode): number {
  switch (code) {
    case ErrorCode.USER_EXISTS:
      return 409;

    case ErrorCode.INVALID_CREDENTIALS:
    case ErrorCode.UNAUTHORIZED:
    case ErrorCode.TOKEN_EXPIRED:
      return 401;

    case ErrorCode.NOT_FOUND:
    case ErrorCode.KIT_NOT_FOUND:
      return 404;

    case ErrorCode.AUTH_RATE_LIMITED:
    case ErrorCode.LLM_RATE_LIMITED:
      return 429;

    case ErrorCode.INVALID_INPUT:
    case ErrorCode.INVALID_URL:
    case ErrorCode.JD_TOO_SHORT:
    case ErrorCode.BATCH_SIZE_EXCEEDED:
    case ErrorCode.KIT_SCHEMA_INVALID:
      return 400;

    case ErrorCode.ROBOTS_DISALLOWED:
    case ErrorCode.PRIVATE_IP_BLOCKED:
    case ErrorCode.UNAUTHORIZED_KIT_ACCESS:
      return 403;

    case ErrorCode.COMPANY_UNREACHABLE:
    case ErrorCode.LLM_INVALID_JSON:
    case ErrorCode.RESPONSE_TOO_LARGE:
      return 502;

    case ErrorCode.TIMEOUT:
      return 504;

    case ErrorCode.SCHEDULE_ALLOCATION_FAILED:
    case ErrorCode.CASE_FAILED:
    case ErrorCode.GENERATION_IN_PROGRESS:
    case ErrorCode.INTERNAL_ERROR:
    default:
      return 500;
  }
}
