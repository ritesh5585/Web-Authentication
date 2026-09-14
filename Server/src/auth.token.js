import jwt from 'jsonwebtoken';
import { config } from './config.js';

export function generateToken({ userId }) {
    const accessToken = jwt.sign(
        { id: userId },
        config.ACCESS_TOKEN,
        { expiresIn: "15m" }
    );

    const refreshToken = jwt.sign(
        { id: userId },
        config.REFRESH_TOKEN,
        { expiresIn: "7d" }
    );

    return { accessToken, refreshToken };
}

export function verifyAccessToken(token) {
    try {
        return jwt.verify(token, config.ACCESS_TOKEN);
    } catch (error) {
        throw new Error('Invalid access token');
    }
}

export function verifyRefreshToken(token) {
    try {
        return jwt.verify(token, config.REFRESH_TOKEN);
    } catch (error) {
        throw new Error('Invalid refresh token');
    }
}