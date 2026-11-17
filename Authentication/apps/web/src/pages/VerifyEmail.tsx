import { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { api, getErrorMessage } from "../api/client";

export default function VerifyEmail() {
  const email = (useLocation().state as { email?: string } | null)?.email;
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(60);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  if (!email) return <Navigate to="/register" replace />; // hooks ke BAAD

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post("/auth/verify-email", { email, otp: code });
      navigate("/login", { replace: true });
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    setError("");
    try {
      await api.post("/auth/resend-otp", { email });
      setInfo("If the account exists, a new code was sent.");
      setCooldown(60);
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };

  return (
    <div className="mx-auto mt-16 max-w-sm p-4">
      <h1 className="mb-2 text-2xl font-bold">Verify your email</h1>
      <p className="mb-6 text-sm text-gray-600">Code sent to {email}</p>
      <form onSubmit={submit} className="space-y-4">
        <input
          value={code}
          onChange={(e) =>
            setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
          }
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="123456"
          className="w-full rounded border border-gray-300 px-3 py-2 text-center text-2xl tracking-widest"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        {info && <p className="text-sm text-green-600">{info}</p>}
        <button
          disabled={loading || code.length !== 6}
          className="w-full rounded bg-black py-2 text-white disabled:opacity-50"
        >
          {loading ? "Verifying..." : "Verify"}
        </button>
      </form>
      <button
        onClick={resend}
        disabled={cooldown > 0}
        className="mt-4 text-sm underline disabled:no-underline disabled:opacity-50"
      >
        {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
      </button>
    </div>
  );
}
