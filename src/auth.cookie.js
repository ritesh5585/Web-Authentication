const COOKIE_OPTIONS = {
    httpOnly: true,       // JS se access nahi hoga (XSS protection)
    secure: process.env.NODE_ENV === 'production',  // HTTPS only in prod
    sameSite: 'strict',   // CSRF protection
    path: '/',
};

export const setCookie = (res, { accessToken, refreshToken }) => {
    res.cookie('accessToken', accessToken, {
        ...COOKIE_OPTIONS,
        maxAge: 15 * 60 * 1000,  // 15 min
    });

    res.cookie('refreshToken', refreshToken, {
        ...COOKIE_OPTIONS,
        maxAge: 7 * 24 * 60 * 60 * 1000,  // 7 days
    });
};

export const clearCookie = (res) => {
    res.clearCookie('accessToken', COOKIE_OPTIONS);
    res.clearCookie('refreshToken', COOKIE_OPTIONS);
};