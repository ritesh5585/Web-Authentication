import { Router } from "express";
import * as authController from "./auth.controller.js";
import {
  registerSchema,
  resendOtpSchema,
  verifyEmailSchema,
} from "./auth.schema.js";
import { validate } from "../../middleware/validate.js";

const router = Router();

router.post("/register", validate(registerSchema), authController.register);
router.post(
  "/verify-email",
  validate(verifyEmailSchema),
  authController.verifyEmail,
);
router.post("/resend-otp", validate(resendOtpSchema), authController.resendOtp);

export default router;
