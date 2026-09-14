import {
    verifyAcccessToken as verifyAccessToken,
    verifyRefreshToken,
    generateToken
} from './auth.token.js';
import { setCookie, clearCookie } from './auth.cookie.js';
import userModel from "./auth.model.js";

export const protect = async (req, res, next) => {
    let token;

    // Check cookies
    if (req.cookies?.accessToken) {
        token = req.cookies.accessToken;
    }
    else if (req.headers.authorization?.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Not authenticated. Please login.',
        });
    }

    try {
        const decoded = verifyAccessToken(token);
        req.user = { id: decoded.id };
        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: 'Access token expired',
            code: 'TOKEN_EXPIRED',  // Client ko batao refresh kare
        });
    }
};

export const autoRefresh = async (req, res, next) => {
    let accessToken = req.cookies?.accessToken;
    const refreshToken = req.cookies?.refreshToken;

    if (!refreshToken) {
        return next(); // No refresh token, continue as guest
    }

    try {
        if (accessToken) {
            try {
                const decoded = verifyAccessToken(accessToken);
                req.user = { id: decoded.id };
                return next();
            } catch (e) {
            }
        }

        const decoded = verifyRefreshToken(refreshToken);
        const user = await userModel.findById(decoded.id);

        if (!user || user.refreshToken !== refreshToken) {
            clearCookie(res);
            return next();
        }

        const { accessToken: newAccess, refreshToken: newRefresh } = generateToken({
            userId: user._id,
        });

        user.refreshToken = newRefresh;
        await user.save({ validateBeforeSave: false });

        setCookie(res, { accessToken: newAccess, refreshToken: newRefresh });
        req.user = { id: user._id };

        next();
    } catch (err) {
        clearCookie(res);
        next();
    }
};