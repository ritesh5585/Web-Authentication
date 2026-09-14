import express from "express";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import connectToDb from "./src/db.js";
import cookieParser from "cookie-parser";
import buildPage from "./buildPage.js";
import authRouter from "./src/routes.js";
import { config } from "./src/config.js";
import { autoRefresh } from "./src/auth.middleware.js";
import userModel from "./src/auth.model.js";
import { googleCallback } from "./src/auth.controller.js";

await connectToDb();
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(autoRefresh);
app.use(passport.initialize());

const hasCredentials = config.GOOGLE_ID && config.GOOGLE_SECRET;
const googleCallbackUrl = config.GOOGLE_CALLBACK_URL ||
    `http://localhost:${process.env.PORT || 3000}/api/auth/google/callback`;

// Login Page
app.get("/", (req, res) => {
    const { id, name, email, photo, error, success } = req.query;
    const user = id ? { id, name, email, photo } : null;
    res.send(buildPage({ user, page: 'login', error, success }));
});

// Register Page
app.get("/register", (req, res) => {
    const { error, success } = req.query;
    res.send(buildPage({ user: null, page: 'register', error, success }));
});

// Dashboard Page (Protected)
app.get("/dashboard", async (req, res) => {
    if (!req.user) {
        return res.redirect('/?error=Please login first');
    }
    const user = await userModel.findById(req.user.id).select('-password -refreshToken').lean();
    if (!user) return res.redirect('/?error=Please login first');
    res.send(buildPage({ user: { id: user._id, name: user.fullname, email: user.email, photo: user.profilepic, googleId: user.googleId }, page: 'dashboard', ...req.query }));
});

// Profile Page (Protected)
app.get("/profile", async (req, res) => {
    if (!req.user) {
        return res.redirect('/?error=Please login first');
    }
    const user = await userModel.findById(req.user.id).select('-password -refreshToken').lean();
    if (!user) return res.redirect('/?error=Please login first');
    res.send(buildPage({ user: { id: user._id, name: user.fullname, email: user.email, photo: user.profilepic, googleId: user.googleId }, page: 'profile', ...req.query }));
});

// Forgot Password Page
app.get("/forgot-password", (req, res) => {
    const { error, success } = req.query;
    res.send(buildPage({ user: null, page: 'forgot', error, success }));
});

// Reset Password Page
app.get("/reset-password", (req, res) => {
    const { token, error, success } = req.query;
    if (!token) {
        return res.redirect('/forgot-password?error=Invalid reset link');
    }
    res.send(buildPage({ user: null, page: 'reset', token, error, success }));
});

passport.use(new GoogleStrategy({
    clientID: config.GOOGLE_ID,
    clientSecret: config.GOOGLE_SECRET,
    callbackURL: googleCallbackUrl,
    proxy: true
}, (accessToken, refreshToken, profile, done) => done(null, profile)));
console.log('Google Callback URL:', googleCallbackUrl);


// Initiate Google Login
app.get(
    "/api/auth/google",
    (req, res, next) => {
        if (!hasCredentials) {
            return res.send(buildPage({
                user: null,
                page: 'login',
                error: 'Google OAuth not configured. Please check your .env file.'
            }));
        }
        next();
    },
    passport.authenticate("google", { scope: ["profile", "email"] })
);

// Google OAuth Callback
app.get(
    "/api/auth/google/callback",
    passport.authenticate("google", {
        session: false,
        failureRedirect: "/?error=Google authentication failed"
    }),
    googleCallback
);
app.use('/api/auth', authRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(` Server running on http://localhost:${PORT}`);
});