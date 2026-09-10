import crypto from 'crypto';
import { TaroError, ErrorCode } from '@/shared';
import { getRedisClient } from '../../shared/redis';
import { mailerService } from './mailer.service';

const OTP_SECRET = process.env.JWT_SECRET || 'recon_enterprise_otp_secret_salt_32b';
const OTP_TTL_SECONDS = 300; // 5 minutes
const OTP_COOLDOWN_SECONDS = 60; // 60 seconds anti-spam
const MAX_ATTEMPTS = 3; // 3 guesses before automatic revocation
const MAX_HOURLY_DISPATCH = 5; // 5 requests per hour

export function hashOtp(email: string, otp: string): string {
  return crypto
    .createHmac('sha256', OTP_SECRET)
    .update(`${email.trim().toLowerCase()}:${otp.trim()}`)
    .digest('hex');
}

export function generateSecureOtp(): string {
  // Cryptographically uniform 6-digit OTP [100000, 999999]
  return crypto.randomInt(100000, 1000000).toString();
}

export interface StoredOtpPayload {
  hashedOtp: string;
  passwordHash: string;
  attemptsLeft: number;
}

export const otpService = {
  /**
   * Generates and stores a new OTP and pending registration payload in Redis.
   */
  async createPendingRegistration(
    email: string,
    passwordHash: string
  ): Promise<{ otp: string; cooldownSeconds: number }> {
    const redis = await getRedisClient();
    const normalizedEmail = email.trim().toLowerCase();

    // 1. Check cooldown (prevent rapid spam)
    const inCooldown = await redis.get(`otp_cooldown:${normalizedEmail}`);
    if (inCooldown) {
      const remaining = await redis.ttl(`otp_cooldown:${normalizedEmail}`);
      throw new TaroError(
        ErrorCode.AUTH_RATE_LIMITED,
        `Please wait ${remaining > 0 ? remaining : 60} seconds before requesting another code.`
      );
    }

    // 2. Check hourly throttle (max 5 per hour)
    const hourlyKey = `otp_hourly:${normalizedEmail}`;
    const hourlyCountStr = await redis.get(hourlyKey);
    const hourlyCount = hourlyCountStr ? parseInt(hourlyCountStr, 10) : 0;
    if (hourlyCount >= MAX_HOURLY_DISPATCH) {
      throw new TaroError(
        ErrorCode.AUTH_RATE_LIMITED,
        'Too many verification requests for this email. Please try again in an hour.'
      );
    }

    // 3. Generate cryptographic 6-digit OTP and HMAC hash
    const otp = generateSecureOtp();
    const hashedOtp = hashOtp(normalizedEmail, otp);

    const payload: StoredOtpPayload = {
      hashedOtp,
      passwordHash,
      attemptsLeft: MAX_ATTEMPTS,
    };

    // 4. Atomically persist to Redis with 5-minute TTL
    await redis.set(`otp:${normalizedEmail}`, JSON.stringify(payload), {
      ex: OTP_TTL_SECONDS,
    });

    // 5. Set 60-second cooldown
    await redis.set(`otp_cooldown:${normalizedEmail}`, '1', {
      ex: OTP_COOLDOWN_SECONDS,
    });

    // 6. Increment hourly counter
    await redis.incr(hourlyKey);
    if (!hourlyCountStr) {
      await redis.expire(hourlyKey, 3600);
    }

    // 7. Dispatch verification email (Production Resend or formatted dev preview)
    await mailerService.sendVerificationOtp({
      to: normalizedEmail,
      otp,
    });

    return {
      otp,
      cooldownSeconds: OTP_COOLDOWN_SECONDS,
    };
  },

  /**
   * Timing-safe OTP verification with atomic invalidation and attempt limit tracking.
   */
  async verifyOtp(
    email: string,
    candidateOtp: string
  ): Promise<{ passwordHash: string }> {
    const redis = await getRedisClient();
    const normalizedEmail = email.trim().toLowerCase();
    const otpKey = `otp:${normalizedEmail}`;

    const raw = await redis.get(otpKey);
    if (!raw) {
      throw new TaroError(
        ErrorCode.TOKEN_EXPIRED,
        'Verification code has expired or does not exist. Please request a new one.'
      );
    }

    let payload: StoredOtpPayload;
    try {
      payload = JSON.parse(raw);
    } catch {
      await redis.del(otpKey);
      throw new TaroError(ErrorCode.INTERNAL_ERROR, 'Corrupted verification session');
    }

    // Check attempt exhaustion
    if (payload.attemptsLeft <= 0) {
      await redis.del(otpKey);
      throw new TaroError(
        ErrorCode.INVALID_CREDENTIALS,
        'Maximum verification attempts exceeded. Code has been revoked for security.'
      );
    }

    // Constant-time comparison
    const candidateHash = hashOtp(normalizedEmail, candidateOtp);
    const expectedBuf = Buffer.from(payload.hashedOtp, 'hex');
    const candidateBuf = Buffer.from(candidateHash, 'hex');

    const isMatch =
      expectedBuf.length === candidateBuf.length &&
      crypto.timingSafeEqual(expectedBuf, candidateBuf);

    if (!isMatch) {
      payload.attemptsLeft -= 1;
      if (payload.attemptsLeft <= 0) {
        await redis.del(otpKey);
        throw new TaroError(
          ErrorCode.INVALID_CREDENTIALS,
          'Maximum verification attempts exceeded. Code has been revoked for security.'
        );
      }

      const remainingTtl = await redis.ttl(otpKey);
      await redis.set(otpKey, JSON.stringify(payload), {
        ex: remainingTtl > 0 ? remainingTtl : OTP_TTL_SECONDS,
      });

      throw new TaroError(
        ErrorCode.INVALID_CREDENTIALS,
        `Invalid verification code. ${payload.attemptsLeft} attempt(s) remaining.`
      );
    }

    // Success! Atomically clean up Redis session
    await redis.del(otpKey);
    await redis.del(`otp_cooldown:${normalizedEmail}`);

    return {
      passwordHash: payload.passwordHash,
    };
  },

  /**
   * Resends OTP for an existing pending registration.
   */
  async resendOtp(
    email: string
  ): Promise<{ otp: string; cooldownSeconds: number }> {
    const redis = await getRedisClient();
    const normalizedEmail = email.trim().toLowerCase();
    const otpKey = `otp:${normalizedEmail}`;

    const existing = await redis.get(otpKey);
    if (!existing) {
      throw new TaroError(
        ErrorCode.NOT_FOUND,
        'No pending registration found for this email. Please register first.'
      );
    }

    const payload: StoredOtpPayload = JSON.parse(existing);
    return this.createPendingRegistration(normalizedEmail, payload.passwordHash);
  },
};
