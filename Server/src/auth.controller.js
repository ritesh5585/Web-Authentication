import crypto from 'crypto'; 
import userModel from './auth.model.js';
import { generateToken, verifyRefreshToken } from './auth.token.js';  
import { setCookie, clearCookie } from './auth.cookie.js';  

const getUserData = (user) => ({
    id: user._id,
    fullname: user.fullname,
    email: user.email,
    contact: user.contact,
    googleId: user.googleId,
    profilepic: user.profilepic,
});

const successResponse = (res, user, message, status = 200) => {
    res.status(status).json({
        success: true,
        message,
        user: getUserData(user),
    });
};

const errorResponse = (res, message, status = 500, error = null) => {
    console.error(`${message}:`, error?.message || '');
    res.status(status).json({
        success: false,
        message,
        ...(process.env.NODE_ENV === 'development' && error && { error: error.message }),
    });
};

const wantsHtml = (req) => req.accepts('html') && !req.is('json');

const redirectWithMessage = (res, path, key, message) => {
    res.redirect(`${path}?${key}=${encodeURIComponent(message)}`);
};

export const register = async (req, res) => {
    const { email, contact, password, fullname } = req.body;

    if (!email || !contact || !password || !fullname) {
        return errorResponse(res, 'All fields are required', 400);
    }

    try {
        const existing = await userModel.findOne({
            $or: [{ email: email.toLowerCase() }, { contact }],
        });

        if (existing) {
            const field = existing.email === email.toLowerCase() ? 'Email' : 'Contact';
            return errorResponse(res, `${field} already registered`, 409);
        }

        const user = await userModel.create({
            fullname: fullname.trim(),
            contact,
            email: email.toLowerCase(),
            password,
        });

        const { accessToken, refreshToken } = generateToken({ userId: user._id });

        user.refreshToken = refreshToken;
        await user.save({ validateBeforeSave: false });

        setCookie(res, { accessToken, refreshToken });

        if (wantsHtml(req)) {
            return redirectWithMessage(res, '/dashboard', 'success', 'Registration successful');
        }
        successResponse(res, user, 'Registration successful', 201);
    } catch (err) {
        if (wantsHtml(req)) {
            return redirectWithMessage(res, '/register', 'error', 'Registration failed');
        }
        errorResponse(res, 'Registration failed', 500, err);
    }
};

export const login = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return errorResponse(res, 'Email and password required', 400);
    }

    try {
        const user = await userModel.findOne({ email: email.toLowerCase() });

        if (!user) {
            return errorResponse(res, 'Invalid credentials', 401);
        }

        const isMatch = await user.comparePassword(password);

        if (!isMatch) {
            return errorResponse(res, 'Invalid credentials', 401);
        }

        const { accessToken, refreshToken } = generateToken({ userId: user._id });

        user.refreshToken = refreshToken;
        await user.save({ validateBeforeSave: false });

        setCookie(res, { accessToken, refreshToken });

        if (wantsHtml(req)) {
            return redirectWithMessage(res, '/dashboard', 'success', 'Login successful');
        }
        successResponse(res, user, 'Login successful');
    } catch (err) {
        if (wantsHtml(req)) {
            return redirectWithMessage(res, '/', 'error', 'Login failed');
        }
        errorResponse(res, 'Login failed', 500, err);
    }
};

export const refreshAccessToken = async (req, res) => {
    const { refreshToken } = req.cookies;

    if (!refreshToken) {
        return errorResponse(res, 'Refresh token not found', 401);
    }

    try {
        const decoded = verifyRefreshToken(refreshToken);
        const user = await userModel.findById(decoded.id);

        if (!user || user.refreshToken !== refreshToken) {
            return errorResponse(res, 'Invalid refresh token', 403);
        }

        const { accessToken, refreshToken: newRefreshToken } = generateToken({
            userId: user._id,
        });

        user.refreshToken = newRefreshToken;
        await user.save({ validateBeforeSave: false });

        setCookie(res, { accessToken, refreshToken: newRefreshToken });

        // ✅ FIX: successResponse signature match karo
        successResponse(res, user, 'Token refreshed successfully');
    } catch (err) {
        clearCookie(res);
        errorResponse(res, 'Session expired. Please login again', 401, err);
    }
};

export const getMe = async (req, res) => {
    try {
        const user = await userModel.findById(req.user.id).select('-password -refreshToken');

        if (!user) {
            return errorResponse(res, 'User not found', 404);
        }

        res.status(200).json({ success: true, user: getUserData(user) });
    } catch (err) {
        errorResponse(res, 'Failed to fetch profile', 500, err);
    }
};

export const logout = async (req, res) => {
    try {
        const { refreshToken } = req.cookies;

        if (refreshToken) {
            await userModel.findOneAndUpdate(
                { refreshToken },
                { refreshToken: null }
            );
        }

        clearCookie(res);

        if (wantsHtml(req)) {
            return redirectWithMessage(res, '/', 'success', 'Logged out successfully');
        }
        res.status(200).json({
            success: true,
            message: 'Logged out successfully',
        });
    } catch (err) {
        errorResponse(res, 'Logout failed', 500, err);
    }
};

export const googleCallback = async (req, res) => {
    try {
        const { id: googleId, displayName, emails, photos } = req.user;
        const email = emails?.[0]?.value?.toLowerCase();

        if (!email) {
            throw new Error('Email not provided by Google');
        }

        let user = await userModel.findOne({ email });

        if (!user) {
            user = await userModel.create({
                email,
                googleId,
                fullname: displayName || 'Google User',
                profilepic: photos?.[0]?.value || '',
            });
        } else if (!user.googleId) {
            user.googleId = googleId;
            await user.save();
        }

        const { accessToken, refreshToken } = generateToken({ userId: user._id });
        user.refreshToken = refreshToken;
        await user.save({ validateBeforeSave: false });

        setCookie(res, { accessToken, refreshToken });

        res.redirect('/dashboard?success=Google%20login%20successful');
    } catch (err) {
        console.error('Google Auth Error:', err);
        res.redirect('/?error=Google%20authentication%20failed');
    }
};

export const forgotPassword = async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return errorResponse(res, 'Email is required', 400);
    }

    try {
        const user = await userModel.findOne({ email: email.toLowerCase() });

        if (user) {
            const token = crypto.randomBytes(32).toString("hex"); 
            user.resetToken = token;
            user.resetTokenExpiry = Date.now() + 10 * 60 * 1000; // 10 min
            await user.save({ validateBeforeSave: false });

            // await sendResetEmail(email, token);
        }

        res.status(200).json({
            success: true,
            message: 'If account exists, reset link sent',
        });
    } catch (err) {
        errorResponse(res, 'Failed to process request', 500, err);
    }
};

export const resetPassword = async (req, res) => {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
        return errorResponse(res, 'Token and new password required', 400);
    }

    try {

        const user = await userModel.findOne({
            resetToken: token,
            resetTokenExpiry: { $gt: Date.now() }
        });

        if (!user) {
            return errorResponse(res, 'Invalid or expired token', 400);
        }

        user.password = newPassword;
        user.resetToken = undefined;
        user.resetTokenExpiry = undefined;

        await user.save();

        res.status(200).json({
            success: true,
            message: 'Password reset successfully',
        });
    } catch (err) {
        errorResponse(res, 'Failed to reset password', 500, err);
    }
};