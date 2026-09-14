import jwt from 'jsonwebtoken';
import { config } from './config.js';

export function generateToken({userId}) {
    const accessToken = jwt.sign(
        { id: userId },
        config.ACCESS_TOKEN,
        { expiresIn: "15m" }
    )

    const refreshToken = jwt.sign(
        { id: userId },
        config.REFRESH_TOKEN,
        { expiresIn: "7d" }
    )

    return { accessToken, refreshToken }
}