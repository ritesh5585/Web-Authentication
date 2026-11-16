import { OTP_TTL_MS } from "../config/constants.js";

const esc = (s: string) => {
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
};

export function otpEmail(name: string, code: string) {
  const mins = OTP_TTL_MS / 60000;
  return {
    subject: "Your verification code",
    text: `Hi ${name}, your code is ${code}. It expires in ${mins} minutes.`,
    html: `<p>Hi ${esc(name)},</p>
           <p>Your verification code:</p>
           <h1 style="letter-spacing:6px">${code}</h1>
           <p>Expires in ${mins} minutes. If you didn't request this, ignore this email.</p>`,
  };
}
