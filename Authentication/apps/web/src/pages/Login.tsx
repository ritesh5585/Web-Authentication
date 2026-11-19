import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useLocation, useNavigate } from "react-router";
import { api, getErrorCode, getErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { loginSchema, type LoginForm } from "../schemas/auth";

const input = "w-full rounded border border-gray-300 px-3 py-2";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const from =
    (useLocation().state as { from?: { pathname: string } } | null)?.from
      ?.pathname ?? "/dashboard";
  const [serverError, setServerError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

  const onSubmit = async ({ email, password }: LoginForm) => {
    setServerError("");
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (e) {
      if (getErrorCode(e) === "EMAIL_NOT_VERIFIED") {
        await api.post("/auth/resend-otp", { email }).catch(() => {});
        navigate("/verify-email", { state: { email } });
        return;
      }
      setServerError(getErrorMessage(e));
    }
  };

  return (
    <div className="mx-auto mt-16 max-w-sm p-4">
      <h1 className="mb-6 text-2xl font-bold">Login</h1>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div>
          <input
            {...register("email")}
            type="email"
            placeholder="Email"
            className={input}
          />
          {errors.email && (
            <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
          )}
        </div>
        <div>
          <input
            {...register("password")}
            type="password"
            placeholder="Password"
            className={input}
          />
          {errors.password && (
            <p className="mt-1 text-sm text-red-600">
              {errors.password.message}
            </p>
          )}
        </div>
        {serverError && <p className="text-sm text-red-600">{serverError}</p>}
        <button
          disabled={isSubmitting}
          className="w-full rounded bg-black py-2 text-white disabled:opacity-50"
        >
          {isSubmitting ? "Signing in..." : "Login"}
        </button>
      </form>
      <p className="mt-4 text-sm">
        New here?{" "}
        <Link to="/register" className="underline">
          Create account
        </Link>
      </p>
    </div>
  );
}
