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

export function verifyAcccessToken(token){
    try {
        return jwt.varify(token, config.ACCESS_TOKEN)
    } catch (error) {
        console.error("Invalid access token")
    }
}

export function verifyRefreshToken(token){
    try {
        return jwt.verify(token, config.REFRESH_TOKEN)
    } catch (error) {
        console.error("Invalid refresh token found")
    }
}