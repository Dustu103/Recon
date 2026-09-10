import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import {
  RegisterInputSchema,
  LoginInputSchema,
  TaroError,
  ErrorCode,
} from '@/shared';
import { UserModel } from '../models/user.model';
import {
  signSessionToken,
  setSessionCookie,
  clearSessionCookie,
  DUMMY_PASSWORD_HASH,
} from '../utils/jwt';
import { otpService } from '../services/otp.service';
import { passwordResetService } from '../services/password-reset.service';

export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parseResult = RegisterInputSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new TaroError(
        ErrorCode.INVALID_INPUT,
        parseResult.error.errors.map((e) => e.message).join('; ')
      );
    }

    const { email, password } = parseResult.data;

    // Check email uniqueness (explicit consumer UX disclosure)
    const existing = await UserModel.findOne({ email });
    if (existing) {
      throw new TaroError(
        ErrorCode.USER_EXISTS,
        'An account with this email already exists'
      );
    }

    // Explicit hashing at controller layer
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await UserModel.create({
      email,
      passwordHash,
    });

    const token = signSessionToken({
      userId: user._id.toString(),
      email: user.email,
    });
    setSessionCookie(res, token);

    res.status(201).json({
      user: {
        id: user._id.toString(),
        email: user.email,
        createdAt: user.createdAt.toISOString(),
      },
    });
  } catch (err: unknown) {
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: number }).code === 11000
    ) {
      return next(
        new TaroError(ErrorCode.USER_EXISTS, 'An account with this email already exists')
      );
    }
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parseResult = LoginInputSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new TaroError(
        ErrorCode.INVALID_INPUT,
        parseResult.error.errors.map((e) => e.message).join('; ')
      );
    }

    const { email, password } = parseResult.data;
    const user = await UserModel.findOne({ email });

    console.log(`[Auth Login] Attempt for email="${email}", userFound=${!!user}`);

    if (!user) {
      // Execute dummy comparison to ensure constant-time response (timing attack mitigation)
      await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
      throw new TaroError(ErrorCode.INVALID_CREDENTIALS, 'Invalid email or password');
    }

    const isMatch = await user.comparePassword(password);
    console.log(`[Auth Login] Password check for email="${email}": match=${isMatch}`);

    if (!isMatch) {
      throw new TaroError(ErrorCode.INVALID_CREDENTIALS, 'Invalid email or password');
    }

    const token = signSessionToken({
      userId: user._id.toString(),
      email: user.email,
    });
    setSessionCookie(res, token);

    res.status(200).json({
      user: {
        id: user._id.toString(),
        email: user.email,
        createdAt: user.createdAt.toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
}

export function logout(_req: Request, res: Response): void {
  clearSessionCookie(res);
  res.status(200).json({ status: 'ok' });
}

export function me(req: Request, res: Response): void {
  res.status(200).json({
    user: req.user,
  });
}

// ── Redis-Backed OTP Verification Handlers ─────────────────────────────────────

export async function sendOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parseResult = RegisterInputSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new TaroError(
        ErrorCode.INVALID_INPUT,
        parseResult.error.errors.map((e) => e.message).join('; ')
      );
    }

    const { email, password } = parseResult.data;

    // Verify email is not already taken
    const existing = await UserModel.findOne({ email });
    if (existing && existing.isVerified !== false) {
      throw new TaroError(
        ErrorCode.USER_EXISTS,
        'An account with this email already exists'
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const { otp, cooldownSeconds } = await otpService.createPendingRegistration(
      email,
      passwordHash
    );

    res.status(200).json({
      status: 'pending_verification',
      email: email.toLowerCase().trim(),
      cooldownSeconds,
      devOtp: process.env.NODE_ENV !== 'production' ? otp : undefined,
    });
  } catch (err) {
    next(err);
  }
}

export async function verifyOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, otp } = req.body;
    if (!email || typeof email !== 'string' || !otp || typeof otp !== 'string') {
      throw new TaroError(
        ErrorCode.INVALID_INPUT,
        'Valid email and 6-digit verification code are required'
      );
    }

    if (!/^\d{6}$/.test(otp.trim())) {
      throw new TaroError(
        ErrorCode.INVALID_INPUT,
        'Verification code must be exactly 6 digits'
      );
    }

    const normalizedEmail = email.toLowerCase().trim();
    const { passwordHash } = await otpService.verifyOtp(normalizedEmail, otp.trim());

    // Create or activate verified user in MongoDB
    const user = await UserModel.findOneAndUpdate(
      { email: normalizedEmail },
      {
        email: normalizedEmail,
        passwordHash,
        isVerified: true,
        verifiedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    const token = signSessionToken({
      userId: user._id.toString(),
      email: user.email,
    });
    setSessionCookie(res, token);

    res.status(201).json({
      user: {
        id: user._id.toString(),
        email: user.email,
        createdAt: user.createdAt.toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function resendOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string') {
      throw new TaroError(ErrorCode.INVALID_INPUT, 'Email string is required');
    }

    const normalizedEmail = email.toLowerCase().trim();
    const { otp, cooldownSeconds } = await otpService.resendOtp(normalizedEmail);

    res.status(200).json({
      status: 'otp_resent',
      email: normalizedEmail,
      cooldownSeconds,
      devOtp: process.env.NODE_ENV !== 'production' ? otp : undefined,
    });
  } catch (err) {
    next(err);
  }
}

// ── 15-Minute Expiring Password Reset Handlers ────────────────────────────────

export async function forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      throw new TaroError(ErrorCode.INVALID_INPUT, 'A valid email address is required');
    }

    const result = await passwordResetService.requestPasswordReset(email);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { token, password, newPassword } = req.body;
    const targetPassword = newPassword || password;

    if (!token || typeof token !== 'string') {
      throw new TaroError(ErrorCode.INVALID_INPUT, 'Valid reset token is required');
    }

    if (!targetPassword || typeof targetPassword !== 'string' || targetPassword.length < 8 || targetPassword.length > 72) {
      throw new TaroError(
        ErrorCode.INVALID_INPUT,
        'Password must be between 8 and 72 characters'
      );
    }

    const result = await passwordResetService.resetPassword(token, targetPassword);
    res.status(200).json({
      status: 'password_reset_success',
      message: 'Password has been updated successfully. Please sign in with your new password.',
      email: result.email,
    });
  } catch (err) {
    next(err);
  }
}

