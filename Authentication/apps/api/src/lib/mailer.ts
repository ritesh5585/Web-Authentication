import nodemailer from "nodemailer";
import { env } from "../config/env.js";
import { otpEmail } from "../emails/otpEmail.js";

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_SECURE,
  auth: env.SMTP_USER
    ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
    : undefined,
});

export async function sendOtpEmail(to: string, name: string, code: string) {
  const { subject, text, html } = otpEmail(name, code);
  await transporter.sendMail({ from: env.MAIL_FROM, to, subject, text, html });
}
