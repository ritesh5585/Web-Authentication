import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { AppError } from "../../utils/AppError.js";
import { hashPassword, verifyPassword } from "../../lib/hash.js";
import { generateOtp, hashOtp, verifyOtpHash } from "../../lib/otp.js";
import { sendOtpEmail } from "../../lib/mailer.js";
import { logger } from "../../lib/logger.js";
import { randomSecret, sha256, safeEquals } from "../../lib/tokens.js";
import { signAccessToken } from "../../lib/jwt.js";
import {
  createSession,
  revokeByRefreshToken,
  type ClientMeta,
} from "../session/session.service.js";
import {
  OTP_TTL_MS,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_MS,
} from "../../config/constants.js";

const invalidOtp = () =>
  new AppError(400, "Invalid or expired code", "OTP_INVALID");

async function issueVerifyOtp(user: {
  id: string;
  email: string;
  name: string;
}) {
  const last = await prisma.otpCode.findFirst({
    where: { userId: user.id, purpose: "VERIFY_EMAIL" },
    orderBy: { createdAt: "desc" },
  });
  if (last && Date.now() - last.createdAt.getTime() < OTP_RESEND_COOLDOWN_MS) {
    throw new AppError(
      429,
      "Please wait before requesting another code",
      "OTP_COOLDOWN",
    );
  }

  const code = generateOtp();
  await prisma.$transaction([
    prisma.otpCode.deleteMany({
      where: { userId: user.id, purpose: "VERIFY_EMAIL" },
    }),
    prisma.otpCode.create({
      data: {
        userId: user.id,
        purpose: "VERIFY_EMAIL",
        codeHash: hashOtp(code),
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
      },
    }),
  ]);
  await sendOtpEmail(user.email, user.name, code);
}

export async function register(input: {
  name: string;
  email: string;
  password: string;
}) {
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
  });
  if (existing?.emailVerifiedAt) {
    throw new AppError(409, "Email already registered", "EMAIL_TAKEN");
  }

  const passwordHash = await hashPassword(input.password);

  try {
    const user = existing
      ? await prisma.user.update({
          where: { id: existing.id },
          data: { name: input.name, passwordHash },
        })
      : await prisma.user.create({
          data: {
            name: input.name,
            email: input.email,
            passwordHash,
          },
        });
    await issueVerifyOtp(user);
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      throw new AppError(409, "Email already registered", "EMAIL_TAKEN");
    }
    throw e;
  }
}

export async function verifyEmail(input: { email: string; code: string }) {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
  });
  const otp = user
    ? await prisma.otpCode.findFirst({
        where: { userId: user.id, purpose: "VERIFY_EMAIL", usedAt: null },
        orderBy: { createdAt: "desc" },
      })
    : null;

  if (!user || !otp || otp.expiresAt < new Date()) throw invalidOtp();

  const { attempts } = await prisma.otpCode.update({
    where: { id: otp.id },
    data: { attempts: { increment: 1 } },
  });
  if (attempts > OTP_MAX_ATTEMPTS) {
    throw new AppError(
      429,
      "Too many attempts. Request a new code.",
      "OTP_LOCKED",
    );
  }
  if (!verifyOtpHash(input.code, otp.codeHash)) throw invalidOtp();

  await prisma.$transaction(async (tx) => {
    const consumed = await tx.otpCode.updateMany({
      where: { id: otp.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (consumed.count === 0) throw invalidOtp();

    await tx.user.update({
      where: { id: user.id },
      data: {
        emailVerifiedAt: new Date(),
      },
    });
  });
}

export async function resendOtp(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.emailVerifiedAt) return;
  try {
    await issueVerifyOtp(user);
  } catch (e) {
    if (e instanceof AppError && e.code === "OTP_COOLDOWN") {
      logger.info({ userId: user.id }, "resend blocked by cooldown");
      return;
    }
    throw e;
  }
}

export async function login(
  input: { email: string; password: string },
  meta: ClientMeta,
) {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
  });

  const valid =
    !!user &&
    !!user.passwordHash &&
    !user.deletedAt &&
    !!user.emailVerifiedAt &&
    (await verifyPassword(input.password, user.passwordHash));

  if (!valid) {
    throw new AppError(401, "Invalid email or password", "INVALID_CREDENTIALS");
  }

  const { sessionId, refreshToken } = await createSession(user.id, meta);
  return {
    accessToken: signAccessToken(user.id, sessionId),
    refreshToken,
    user: { id: user.id, email: user.email, name: user.name },
  };
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt)
    throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
  return { id: user.id, email: user.email, name: user.name };
}

const unauthorized = () => new AppError(401, "Session expired", "UNAUTHORIZED");

export async function refresh(token: string, meta: ClientMeta) {
  const sessionId = token.split(".")[0];
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { user: true },
  });

  if (
    !session ||
    session.revokedAt ||
    session.expiresAt < new Date() ||
    session.user.deletedAt
  ) {
    throw unauthorized();
  }

  const oldHash = sha256(token);

  if (!safeEquals(oldHash, session.refreshTokenHash)) {
    
    if (
      session.prevRefreshTokenHash &&
      safeEquals(oldHash, session.prevRefreshTokenHash)
    ) {
      await prisma.session.updateMany({
        where: { userId: session.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      logger.warn(
        { userId: session.userId },
        "refresh token reuse detected, all sessions revoked",
      );
    }
    throw unauthorized();
  }

  const newToken = `${session.id}.${randomSecret()}`;
  
  const { count } = await prisma.session.updateMany({
    where: { id: session.id, refreshTokenHash: oldHash, revokedAt: null },
    data: {
      refreshTokenHash: sha256(newToken),
      prevRefreshTokenHash: oldHash,
      lastUsedAt: new Date(),
      ip: meta.ip,
      userAgent: meta.userAgent?.slice(0, 255),
    },
  });
  if (count === 0) throw unauthorized();

  return {
    accessToken: signAccessToken(session.userId, session.id),
    refreshToken: newToken,
  };
}

export const logout = (token?: string) =>
  token ? revokeByRefreshToken(token) : Promise.resolve();
