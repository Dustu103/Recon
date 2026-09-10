import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import {
  passwordResetService,
  hashResetToken,
  generateResetToken,
  RESET_TOKEN_TTL_SECONDS,
} from '../../auth/services/password-reset.service';
import { UserModel } from '../../auth/models/user.model';
import { getRedisClient, closeRedisClient } from '../../shared/redis';
import { connectDatabase } from '../../shared/db';
import { TaroError, ErrorCode } from '@/shared';

describe('15-Minute Expiring Password Reset Service', () => {
  beforeAll(async () => {
    await connectDatabase();
  });

  beforeEach(async () => {
    const redis = await getRedisClient();
    await UserModel.deleteMany({ email: /@reset-test\.ai$/ });
    // Clean all redis test keys
    const testEmail = 'candidate@reset-test.ai';
    await redis.del(`password_reset_cooldown:${testEmail}`);
  });

  afterAll(async () => {
    await UserModel.deleteMany({ email: /@reset-test\.ai$/ });
    await closeRedisClient();
    await mongoose.disconnect();
  });

  it('generates cryptographic 64-hex-char tokens and deterministic HMAC hashes', () => {
    const t1 = generateResetToken();
    const t2 = generateResetToken();
    expect(t1).toHaveLength(64);
    expect(t2).toHaveLength(64);
    expect(t1).not.toBe(t2);

    const h1 = hashResetToken(t1);
    const h2 = hashResetToken(t1);
    const h3 = hashResetToken(t2);
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
  });

  it('generates a 15-minute expiring reset token in Redis for registered users', async () => {
    const email = 'candidate@reset-test.ai';
    const originalHash = await bcrypt.hash('OldPassword123!', 10);
    const user = await UserModel.create({
      email,
      passwordHash: originalHash,
    });

    const res = await passwordResetService.requestPasswordReset(email);
    expect(res.status).toBe('reset_link_dispatched');
    expect(res.cooldownSeconds).toBe(60);
    expect(res.devResetLink).toBeDefined();

    // Extract raw token from reset link
    const token = new URL(res.devResetLink!).searchParams.get('token');
    expect(token).toBeDefined();

    // Check Redis persistence
    const redis = await getRedisClient();
    const tokenHash = hashResetToken(token!);
    const rawPayload = await redis.get(`password_reset:${tokenHash}`);
    expect(rawPayload).not.toBeNull();

    const payload = JSON.parse(rawPayload!);
    expect(payload.userId).toBe(user._id.toString());
    expect(payload.email).toBe(email);

    // Check TTL is within 15 minutes (900 seconds)
    const ttl = await redis.ttl(`password_reset:${tokenHash}`);
    expect(ttl).toBeGreaterThan(880);
    expect(ttl).toBeLessThanOrEqual(RESET_TOKEN_TTL_SECONDS);
  });

  it('enforces 60-second anti-spam cooldown on consecutive requests', async () => {
    const email = 'candidate@reset-test.ai';
    const hash = await bcrypt.hash('OldPassword123!', 10);
    await UserModel.create({ email, passwordHash: hash });

    await passwordResetService.requestPasswordReset(email);

    // Immediate second request must trigger AUTH_RATE_LIMITED
    await expect(passwordResetService.requestPasswordReset(email)).rejects.toThrow(
      /Please wait .* seconds before requesting another reset link/
    );
  });

  it('preserves privacy and prevents user enumeration for unknown emails', async () => {
    const unknownEmail = 'nonexistent@reset-test.ai';
    const res = await passwordResetService.requestPasswordReset(unknownEmail);

    expect(res.status).toBe('reset_link_dispatched');
    expect(res.devResetLink).toBeUndefined(); // Zero dev link exposed for non-existent users
  });

  it('successfully updates user password and atomically revokes token upon use', async () => {
    const email = 'candidate@reset-test.ai';
    const oldHash = await bcrypt.hash('OldPassword123!', 10);
    const user = await UserModel.create({
      email,
      passwordHash: oldHash,
    });

    const requestRes = await passwordResetService.requestPasswordReset(email);
    const token = new URL(requestRes.devResetLink!).searchParams.get('token')!;

    // Perform password reset with new password
    const resetRes = await passwordResetService.resetPassword(token, 'BrandNewPassword456!');
    expect(resetRes.success).toBe(true);
    expect(resetRes.email).toBe(email);

    // Verify password changed in DB
    const refreshedUser = await UserModel.findById(user._id);
    expect(refreshedUser).toBeDefined();
    const isOldMatch = await bcrypt.compare('OldPassword123!', refreshedUser!.passwordHash);
    const isNewMatch = await bcrypt.compare('BrandNewPassword456!', refreshedUser!.passwordHash);
    expect(isOldMatch).toBe(false);
    expect(isNewMatch).toBe(true);

    // Verify token was atomically deleted from Redis (Single-Use Guarantee)
    const redis = await getRedisClient();
    const tokenHash = hashResetToken(token);
    expect(await redis.get(`password_reset:${tokenHash}`)).toBeNull();

    // Reusing the same token must fail with TOKEN_EXPIRED
    await expect(
      passwordResetService.resetPassword(token, 'AnotherPassword789!')
    ).rejects.toThrow(/invalid or has expired/);
  });

  it('rejects passwords violating 8–72 character bounds', async () => {
    const fakeToken = generateResetToken();

    // Too short (< 8 chars)
    await expect(passwordResetService.resetPassword(fakeToken, 'short')).rejects.toThrow(
      /Password must be between 8 and 72 characters/
    );

    // Too long (> 72 chars)
    const longPassword = 'a'.repeat(73);
    await expect(passwordResetService.resetPassword(fakeToken, longPassword)).rejects.toThrow(
      /Password must be between 8 and 72 characters/
    );
  });
});
