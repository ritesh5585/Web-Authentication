import axios, { type InternalAxiosRequestConfig } from "axios";

export const api = axios.create({ baseURL: "/api", withCredentials: true });

let accessToken: string | null = null;
export const setAccessToken = (t: string | null) => {
  accessToken = t;
};

api.interceptors.request.use((cfg) => {
  if (accessToken) cfg.headers.Authorization = `Bearer ${accessToken}`;
  return cfg;
});

let refreshPromise: Promise<string> | null = null;
function refreshAccessToken() {
  refreshPromise ??= axios
    .post("/api/auth/refresh", null, { withCredentials: true })
    .then((r) => {
      setAccessToken(r.data.accessToken);
      return r.data.accessToken as string;
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

const NO_REFRESH = ["/auth/login", "/auth/refresh", "/auth/logout"];

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config as
      | (InternalAxiosRequestConfig & { _retry?: boolean })
      | undefined;
    const skip =
      !original || original._retry || NO_REFRESH.includes(original.url ?? "");
    if (axios.isAxiosError(error) && error.response?.status === 401 && !skip) {
      original._retry = true;
      try {
        const token = await refreshAccessToken();
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      } catch {
        setAccessToken(null);
        window.dispatchEvent(new Event("auth:expired"));
      }
    }
    return Promise.reject(error);
  },
);

export const getErrorMessage = (err: unknown): string =>
  axios.isAxiosError(err)
    ? (err.response?.data?.error?.message ?? "Network error")
    : "Something went wrong";

export const getErrorCode = (err: unknown): string | undefined =>
  axios.isAxiosError(err) ? err.response?.data?.error?.code : undefined;
