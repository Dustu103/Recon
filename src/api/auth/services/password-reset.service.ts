import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { TaroError, ErrorCode } from '@/shared';
import { getRedisClient } from '../../shared/redis';
import { UserModel } from '../models/user.model';
import { mailerService } from './mailer.service';
import { DUMMY_PASSWORD_HASH } from '../utils/jwt';

const RESET_SECRET = process.env.JWT_SECRET || 'recon_enterprise_password_reset_secret_salt_32b';
export const RESET_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes (900 seconds)
export const RESET_COOLDOWN_SECONDS = 60; // 60 seconds anti-spam

export function hashResetToken(token: string): string {
  return crypto
    .createHmac('sha256', RESET_SECRET)
    .update(token.trim())
    .digest('hex');
}

export function generateResetToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export interface StoredResetPayload {
  userId: string;
  email: string;
}

export const passwordResetService = {
  /**
   * Generates a 15-minute expiring password reset token, persists its HMAC hash in Redis,
   * and dispatches a reset link email to the user.
   */
  async requestPasswordReset(email: string): Promise<{
    status: string;
    message: string;
    cooldownSeconds: number;
    devResetLink?: string;
  }> {
    const normalizedEmail = email.trim().toLowerCase();
    const redis = await getRedisClient();

    // 1. Check anti-spam cooldown (60s)
    const cooldownKey = `password_reset_cooldown:${normalizedEmail}`;
    const inCooldown = await redis.get(cooldownKey);
    if (inCooldown) {
      const remaining = await redis.ttl(cooldownKey);
      throw new TaroError(
        ErrorCode.AUTH_RATE_LIMITED,
        `Please wait ${remaining > 0 ? remaining : 60} seconds before requesting another reset link.`
      );
    }

    // 2. Check user existence (Privacy / Anti-Enumeration Defense)
    const user = await UserModel.findOne({ email: normalizedEmail });
    if (!user) {
      // Execute dummy bcrypt comparison to ensure identical response latency
      await bcrypt.compare('dummy-password-string', DUMMY_PASSWORD_HASH);
      return {
        status: 'reset_link_dispatched',
        message: 'If an account exists with this email address, a password reset link has been dispatched.',
        cooldownSeconds: RESET_COOLDOWN_SECONDS,
      };
    }

    // 3. Generate cryptographic token and hash
    const rawToken = generateResetToken();
    const tokenHash = hashResetToken(rawToken);

    const payload: StoredResetPayload = {
      userId: user._id.toString(),
      email: user.email,
    };

    // 4. Persist to Redis with 15-minute expiration (900s)
    const resetKey = `password_reset:${tokenHash}`;
    await redis.set(resetKey, JSON.stringify(payload), {
      ex: RESET_TOKEN_TTL_SECONDS,
    });

    // 5. Set 60-second cooldown
    await redis.set(cooldownKey, '1', {
      ex: RESET_COOLDOWN_SECONDS,
    });

    // 6. Build reset link
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.APP_URL ||
      'http://localhost:3000';
    const resetLink = `${appUrl.replace(/\/$/, '')}/reset-password?token=${rawToken}`;

    // 7. Dispatch email via Resend or dev preview
    await mailerService.sendPasswordResetLink({
      to: user.email,
      resetLink,
      token: rawToken,
    });

    return {
      status: 'reset_link_dispatched',
      message: 'If an account exists with this email address, a password reset link has been dispatched.',
      cooldownSeconds: RESET_COOLDOWN_SECONDS,
      devResetLink: process.env.NODE_ENV !== 'production' ? resetLink : undefined,
    };
  },

  /**
   * Verifies the 15-minute reset token, updates the password in MongoDB,
   * and revokes the token immediately to ensure single-use.
   */
  async resetPassword(token: string, newPassword: string): Promise<{ success: boolean; email: string }> {
    if (!token || typeof token !== 'string' || token.trim().length === 0) {
      throw new TaroError(ErrorCode.INVALID_INPUT, 'Password reset token is required');
    }

    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 72) {
      throw new TaroError(
        ErrorCode.INVALID_INPUT,
        'Password must be between 8 and 72 characters'
      );
    }

    const redis = await getRedisClient();
    const tokenHash = hashResetToken(token.trim());
    const resetKey = `password_reset:${tokenHash}`;

    // Retrieve token payload from Redis
    const rawPayload = await redis.get(resetKey);
    if (!rawPayload) {
      throw new TaroError(
        ErrorCode.TOKEN_EXPIRED,
        'Password reset link is invalid or has expired. Please request a new one.'
      );
    }

    let payload: StoredResetPayload;
    try {
      payload = JSON.parse(rawPayload);
    } catch {
      await redis.del(resetKey);
      throw new TaroError(ErrorCode.INTERNAL_ERROR, 'Corrupted password reset token');
    }

    // Hash new password with bcrypt
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Update user in MongoDB
    const updatedUser = await UserModel.findByIdAndUpdate(
      payload.userId,
      { passwordHash },
      { new: true }
    );

    if (!updatedUser) {
      await redis.del(resetKey);
      throw new TaroError(ErrorCode.NOT_FOUND, 'User account not found');
    }

    // Revoke token immediately (Single-Use Guarantee)
    await redis.del(resetKey);
    await redis.del(`password_reset_cooldown:${payload.email.toLowerCase().trim()}`);

    return {
      success: true,
      email: updatedUser.email,
    };
  },
};
