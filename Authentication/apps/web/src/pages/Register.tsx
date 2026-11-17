import { Link, useNavigate } from "react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { type RegisterForm, registerSchema } from "../schemas/auth";
import { zodResolver } from "@hookform/resolvers/zod";
import { api, getErrorMessage } from "../api/client";

const input = "w-full rounded border border-gray-300 px-3 py-2";
const err = "mt-1 text-sm text-red-600";

const Register = () => {
  const navigate = useNavigate();
  const [Error, setError] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) });

  const onSubmit = async ({ name, email, password }: RegisterForm) => {
    setError("");
    try {
      await api.post("/auth/register", { name, email, password });
      navigate("/verify-email", { state: { email } });
    } catch (error) {
      setError(getErrorMessage(error));
    }
  };

  return (
    <div className="mx-auto mt-16 max-w-sm p-4">
      <h1 className="mb-6 text-2xl font-bold">Create account</h1>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div>
          <input {...register("name")} placeholder="Name" className={input} />
          {errors.name && <p className={err}>{errors.name.message}</p>}
        </div>
        <div>
          <input
            {...register("email")}
            type="email"
            placeholder="Email"
            className={input}
          />
          {errors.email && <p className={err}>{errors.email.message}</p>}
        </div>
        <div>
          <input
            {...register("password")}
            type="password"
            placeholder="Password"
            className={input}
          />
          {errors.password && <p className={err}>{errors.password.message}</p>}
        </div>
        <div>
          <input
            {...register("confirmPassword")}
            type="password"
            placeholder="Confirm password"
            className={input}
          />
          {errors.confirmPassword && (
            <p className={err}>{errors.confirmPassword.message}</p>
          )}
        </div>
        {Error && <p className={err}>{Error}</p>}
        <button
          disabled={isSubmitting}
          className="w-full rounded bg-black py-2 text-white disabled:opacity-50"
        >
          {isSubmitting ? "Creating..." : "Register"}
        </button>
      </form>
      <p className="mt-4 text-sm">
        Already have an account?{" "}
        <Link to="/login" className="underline">
          Login
        </Link>
      </p>
    </div>
  );
};

export default Register;
