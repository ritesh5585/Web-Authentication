import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { AppError } from "../../utils/AppError.js";
import { hashPassword } from "../../lib/hash.js";
import { generateOtp, hashOtp, verifyOtpHash } from "../../lib/otp.js";
import { sendOtpEmail } from "../../lib/mailer.js";
import { logger } from "../../lib/logger.js";
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
  await sendOtpEmail(user.email, user.name, code); // DB commit ke BAAD
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
      throw new AppError(409, "Email already registered", "EMAIL_TAKEN"); // race condition catch
    }
    throw e;
  }
}

export async function verifyEmail(input: {
  email: string;
  code: string;
}) {
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

  // Pehle atomically attempt gino, phir compare (neeche "kyun" padh)
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
  if (!user || user.emailVerifiedAt) return; // chup-chaap, kuch reveal nahi
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
