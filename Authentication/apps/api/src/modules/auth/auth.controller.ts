import type { Request, RequestHandler } from "express";
import * as authService from "./auth.service.js";
import { revokeAllSessions } from "../session/session.service.js";
import { setRefreshTokenCookie, clearRefreshTokenCookie, REFRESH_COOKIE } from "../../lib/cookies.js";
import { AppError } from "../../utils/AppError.js";

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

const meta = (req: Request) => ({
  ip: req.ip,
  userAgent: req.get("user-agent"),
});

export const login: RequestHandler = async (req, res) => {
  const { refreshToken, accessToken, user } = await authService.login(
    req.body,
    meta(req),
  );
  setRefreshTokenCookie(res, refreshToken);
  res.json({ accessToken, user });
};

export const refresh: RequestHandler = async (req, res) => {
  const token = req.cookies[REFRESH_COOKIE];
  if (!token) throw new AppError(401, "No session", "UNAUTHORIZED");
  const { refreshToken, accessToken } = await authService.refresh(
    token,
    meta(req),
  );
  setRefreshTokenCookie(res, refreshToken);
  res.json({ accessToken });
};

export const logout: RequestHandler = async (req, res) => {
  await authService.logout(req.cookies[REFRESH_COOKIE]);
  clearRefreshTokenCookie(res);
  res.json({ message: "Logged out" });
};

export const logoutAll: RequestHandler = async (req, res) => {
  await revokeAllSessions(req.auth!.userId);
  clearRefreshTokenCookie(res);
  res.json({ message: "Logged out from all devices" });
};

export const me: RequestHandler = async (req, res) => {
  res.json({ user: await authService.getMe(req.auth!.userId) });
};
