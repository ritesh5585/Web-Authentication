import { Router } from 'express';
import { protect as authenticateUser  } from './auth.middleware.js';
import { validateRegister, validateLogin } from './auth.validator.js';
import {
    register,
    login,
    getMe,
    logout,
    forgotPassword,
    resetPassword,
    refreshAccessToken
} from './auth.controller.js';

const router = Router();

//Refresh token routes
router.post("/refresh", refreshAccessToken)

// Register & Login
router.post('/register', validateRegister, register);
router.post('/login', validateLogin, login);

// Password Management
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// These routes require authentication (JWT token)
router.get('/me', authenticateUser, getMe);
router.post('/logout', authenticateUser, logout);

export default router;