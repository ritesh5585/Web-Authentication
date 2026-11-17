import type { RequestHandler } from "express";
import * as authService from "./auth.service.js";

export const register: RequestHandler = async (req, res) => {
  await authService.register(req.body);
  res.status(200).json({ message: "Verification code sent" });
};

export const verifyEmail: RequestHandler = async (req, res) => {
  await authService.verifyEmail({
    email: req.body.email,
    code: req.body.otp,
  });
  res.json({ message: "Email verified" });
};

export const resendOtp: RequestHandler = async (req, res) => {
  await authService.resendOtp(req.body.email);
  res.json({ message: "If the account exists, a new code was sent" });
};
