import { useCallback, useEffect, useState } from "react";
import { api, getErrorMessage } from "../api/client";
import { useAuth } from "../context/AuthContext";

type Session = {
  id: string;
  userAgent: string | null;
  ip: string | null;
  lastUsedAt: string;
  current: boolean;
};

export default function Dashboard() {
  const { user, logout, logoutAll } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/sessions");
      setSessions(data.sessions);
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const revoke = async (id: string) => {
    await api.delete(`/sessions/${id}`);
    load();
  };

  return (
    <div className="mx-auto mt-12 max-w-2xl p-4">
      <h1 className="text-2xl font-bold">Hi, {user?.name}</h1>
      <p className="text-sm text-gray-600">{user?.email}</p>

      <div className="mt-4 flex gap-3">
        <button
          onClick={logout}
          className="rounded bg-black px-4 py-2 text-white"
        >
          Logout
        </button>
        <button onClick={logoutAll} className="rounded border px-4 py-2">
          Logout all devices
        </button>
      </div>

      <h2 className="mb-2 mt-8 font-semibold">Active devices</h2>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <ul className="space-y-2">
        {sessions.map((s) => (
          <li
            key={s.id}
            className="flex items-center justify-between rounded border p-3 text-sm"
          >
            <div>
              <p className="max-w-md truncate">
                {s.userAgent ?? "Unknown device"}
              </p>
              <p className="text-gray-500">
                {s.ip} · last active {new Date(s.lastUsedAt).toLocaleString()}
              </p>
            </div>
            {s.current ? (
              <span className="rounded bg-green-100 px-2 py-1 text-green-700">
                This device
              </span>
            ) : (
              <button
                onClick={() => revoke(s.id)}
                className="text-red-600 underline"
              >
                Revoke
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
