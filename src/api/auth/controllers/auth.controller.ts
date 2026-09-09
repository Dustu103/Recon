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

    if (!user) {
      // Execute dummy comparison to ensure constant-time response (timing attack mitigation)
      await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
      throw new TaroError(ErrorCode.INVALID_CREDENTIALS, 'Invalid email or password');
    }

    const isMatch = await user.comparePassword(password);
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
