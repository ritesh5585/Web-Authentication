import { Router } from "express";
import * as authController from "./auth.controller.js";
import {
  loginSchema,
  registerSchema,
  resendOtpSchema,
  verifyEmailSchema,
} from "./auth.schema.js";
import { validate } from "../../middleware/validate.js";
import { authenticate } from "../../middleware/authenticate.js";

const router = Router();

router.post("/register", validate(registerSchema), authController.register);
router.post(
  "/verify-email",
  validate(verifyEmailSchema),
  authController.verifyEmail,
);
router.post("/resend-otp", validate(resendOtpSchema), authController.resendOtp);
router.post("/login", validate(loginSchema), authController.login);
router.post("/refresh", authController.refresh);
router.post("/logout", authController.logout);
router.post("/logout-all", authenticate, authController.logoutAll);
router.get("/me", authenticate, authController.me);

export default router;
