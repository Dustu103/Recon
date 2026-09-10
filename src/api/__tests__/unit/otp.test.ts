import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import {
  otpService,
  generateSecureOtp,
  hashOtp,
} from '../../auth/services/otp.service';
import { getRedisClient, closeRedisClient } from '../../shared/redis';
import { TaroError, ErrorCode } from '@/shared';

describe('Redis-Backed Enterprise OTP Service', () => {
  beforeEach(async () => {
    const redis = await getRedisClient();
    // Clear test keys
    await redis.del('otp:test@recon.ai');
    await redis.del('otp_cooldown:test@recon.ai');
    await redis.del('otp_hourly:test@recon.ai');
  });

  afterAll(async () => {
    await closeRedisClient();
  });

  it('generates a cryptographically uniform 6-digit numeric OTP', () => {
    for (let i = 0; i < 50; i++) {
      const otp = generateSecureOtp();
      expect(otp).toHaveLength(6);
      expect(/^\d{6}$/.test(otp)).toBe(true);
      const num = parseInt(otp, 10);
      expect(num).toBeGreaterThanOrEqual(100000);
      expect(num).toBeLessThan(1000000);
    }
  });

  it('computes deterministic HMAC-SHA256 hashes', () => {
    const hash1 = hashOtp('test@recon.ai', '123456');
    const hash2 = hashOtp('test@recon.ai', '123456');
    const hashDiffEmail = hashOtp('other@recon.ai', '123456');
    const hashDiffOtp = hashOtp('test@recon.ai', '123457');

    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hashDiffEmail);
    expect(hash1).not.toBe(hashDiffOtp);
  });

  it('creates pending registration and verifies successfully with correct OTP', async () => {
    const email = 'test@recon.ai';
    const passwordHash = '$2a$10$dummyhashedpasswordvalue';

    const { otp, cooldownSeconds } = await otpService.createPendingRegistration(
      email,
      passwordHash
    );

    expect(otp).toHaveLength(6);
    expect(cooldownSeconds).toBe(60);

    // Verify correct OTP
    const res = await otpService.verifyOtp(email, otp);
    expect(res.passwordHash).toBe(passwordHash);

    // Verify key was atomically deleted upon success
    const redis = await getRedisClient();
    const remaining = await redis.get(`otp:${email}`);
    expect(remaining).toBeNull();
  });

  it('enforces strict 3-attempt brute force lockout and revokes key', async () => {
    const email = 'test@recon.ai';
    const passwordHash = '$2a$10$dummyhashedpasswordvalue';

    const { otp } = await otpService.createPendingRegistration(email, passwordHash);

    // Wrong attempt 1
    await expect(otpService.verifyOtp(email, '000000')).rejects.toThrow(
      /2 attempt\(s\) remaining/
    );

    // Wrong attempt 2
    await expect(otpService.verifyOtp(email, '000001')).rejects.toThrow(
      /1 attempt\(s\) remaining/
    );

    // Wrong attempt 3 (lockout & revocation)
    await expect(otpService.verifyOtp(email, '000002')).rejects.toThrow(
      /Maximum verification attempts exceeded/
    );

    // Verify key is now gone from Redis even though TTL hasn't elapsed
    const redis = await getRedisClient();
    const key = await redis.get(`otp:${email}`);
    expect(key).toBeNull();

    // Even correct OTP should now fail because key was revoked
    await expect(otpService.verifyOtp(email, otp)).rejects.toThrow(
      /expired or does not exist/
    );
  });

  it('allows successful verification on the 3rd and final attempt', async () => {
    const email = 'test@recon.ai';
    const passwordHash = '$2a$10$dummyhashedpasswordvalue';

    const { otp } = await otpService.createPendingRegistration(email, passwordHash);

    // Wrong attempt 1
    await expect(otpService.verifyOtp(email, '000000')).rejects.toThrow(
      /2 attempt\(s\) remaining/
    );

    // Wrong attempt 2
    await expect(otpService.verifyOtp(email, '000001')).rejects.toThrow(
      /1 attempt\(s\) remaining/
    );

    // Correct attempt 3 -> SUCCEEDS!
    const res = await otpService.verifyOtp(email, otp);
    expect(res.passwordHash).toBe(passwordHash);

    // Key is cleaned up
    const redis = await getRedisClient();
    expect(await redis.get(`otp:${email}`)).toBeNull();
  });

  it('enforces 60-second cooldown on consecutive OTP requests', async () => {
    const email = 'test@recon.ai';
    const passwordHash = '$2a$10$dummyhashedpasswordvalue';

    await otpService.createPendingRegistration(email, passwordHash);

    // Immediate second request should be throttled by cooldown
    await expect(
      otpService.createPendingRegistration(email, passwordHash)
    ).rejects.toThrow(/Please wait .* seconds before requesting another code/);
  });
});
