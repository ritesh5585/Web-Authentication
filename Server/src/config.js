import dotenv from "dotenv"
dotenv.config()

function getEnv(key, required = true, defaultValue = null) {
    const value = process.env[key]

    if (!value) {
        if (required) {
            throw new Error(`${key} is not defined in environment variables`)
        }
        return defaultValue
    }

    return value
}

export const config = {

    // Database
    MONGO_URI: getEnv('MONGO_URI'),

    // Authentication
    ACCESS_TOKEN: getEnv('ACCESS_TOKEN'),
    REFRESH_TOKEN: getEnv("REFRESH_TOKEN"),
    GOOGLE_ID: getEnv('GOOGLE_CLIENT_ID', false),
    GOOGLE_SECRET: getEnv('GOOGLE_CLIENT_SECRET', false),
    GOOGLE_CALLBACK_URL: getEnv('GOOGLE_CALLBACK_URL', false)
}