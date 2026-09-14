import userModel from './auth.model.js';
import { generateToken } from './auth.token.js';

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
        user: getUserData(user)
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

/**
 * Register new user
 * POST /api/auth/register
 */
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

        const { accessToken, refreshToken } = generateToken({ userId: user._id })

        user.refreshToken = refreshToken
        await user.save({ validateBeforeSave: false })

        setCookie(res, { refreshToken, accessToken })

        successResponse(res, user, 'Registration successful');

    } catch (err) {
        errorResponse(res, 'Registration failed', 500, err);
    }
};

/**
 * Login user
 * POST /api/auth/login
 */
export const login = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return errorResponse(res, 'Email and password required', 400);
    }

    try {
        const user = await userModel.findOne({ email: email.toLowerCase() });
        const isMatch = await user.comparePassword(password)

        if (!user || !isMatch) {
            return errorResponse(res, 'Invalid credentials', 401);
        }

        const { accessToken, refreshToken } = generateToken({ userId: user._id })

        user.refreshToken = refreshToken
        await user.save({ validateBeforeSave: false })

        setCookie(res, { accessToken, refreshToken })

        successResponse(res, user, 'Login successful');

    } catch (err) {
        errorResponse(res, 'Login failed', 500, err);
    }
};

/**
 * POST /api/auth/refreshAccessToken
 */
export const refreshAccessToken = async (req, res) => {
    const { refreshToken } = req.cookies
    if (!refreshToken) return errorResponse(res, "Invalid Token or not found", 401)

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
        successResponse(res, "token refreshed successfully", 200)

    } catch (err) {
        clearCookie(res);
        errorResponse(res, 'Session expired. Please login again', 401, err);
    }
}


/**
 * Get current user profile
 * GET /api/auth/me
 */
export const getMe = async (req, res) => {
    try {
        const user = await userModel.findById(req.user.id).select('-password');

        if (!user) {
            return errorResponse(res, 'User not found', 404);
        }

        res.status(200).json({ success: true, user: getUserData(user) });

    } catch (err) {
        errorResponse(res, 'Failed to fetch profile', 500, err);
    }
};

/**
 * Logout user
 * POST /api/auth/logout
 */
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

        res.status(200).json({
            success: true,
            message: 'Logged out successfully',
        });
    } catch (err) {
        errorResponse(res, 'Logout failed', 500, err);
    }
};

/**
 * Google OAuth Callback
 * GET /api/auth/google/callback
 * This is called by Passport after Google authentication
 */
export const googleCallback = async (req, res) => {
    try {
        // req.user comes from Passport's GoogleStrategy
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
                isVerified: true,
                role: 'buyer',
            });
        } else if (!user.googleId) {
            user.googleId = googleId;
            await user.save();
        }

        setCookie(res, user);

        const redirectUrl = process.env.CLIENT_URL || 'http://localhost:5173';
        res.redirect(redirectUrl);

    } catch (err) {
        console.error('Google Auth Error:', err);
        const redirectUrl = process.env.CLIENT_URL || 'http://localhost:5173';
        res.redirect(`${redirectUrl}/login?error=google_auth_failed`);
    }
};

/**
 * Forgot password
 * POST /api/auth/forgot-password
 */
export const forgotPassword = async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return errorResponse(res, 'Email is required', 400);
    }

    try {
        const user = await userModel.findOne({ email: email.toLowerCase() });

        if (user) {

            const token = crypto.getRandomBytes(32).toString("hex")
            //  await sendResetEmail(email, token);
        }

        res.status(200).json({
            success: true,
            message: 'If account exists, reset link sent',
        });

    } catch (err) {
        errorResponse(res, 'Failed to process request', 500, err);
    }
};

/**
 * Reset password
 * POST /api/auth/reset-password
 */
export const resetPassword = async (req, res) => {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
        return errorResponse(res, 'Token and new password required', 400);
    }

    try {
        const user = userModel.findOne({ resetToken: token })
        if (!user) return errorResponse(res, 'Invalid token', 400);
        user.password = newPassword

        await user.save()
        res.status(200).json({
            success: true,
            message: 'Password reset successfully',
        });

    } catch (err) {
        errorResponse(res, 'Failed to reset password', 500, err);
    }
};