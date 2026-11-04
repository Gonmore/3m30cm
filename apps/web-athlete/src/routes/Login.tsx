import { useState } from "react";
import { GoogleLogin, type CredentialResponse } from "@react-oauth/google";
import { useAuth } from "../contexts/AuthContext";

export default function Login() {
  const { login, loginWithGoogle } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al iniciar sesión");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse: CredentialResponse) => {
    if (!credentialResponse.credential) return;
    setIsLoading(true);
    setError(null);
    try {
      await loginWithGoogle(credentialResponse.credential);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error con Google");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-950 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-primary-500">3m30cm Atleta</h1>
          <p className="mt-2 text-sm text-surface-400">Tu app móvil de entrenamiento de salto</p>
        </div>

        {error && (
          <div className="rounded-md bg-red-900/30 p-3 text-sm text-red-400">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-surface-300">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full rounded-md border border-surface-700 bg-surface-900 px-3 py-2 text-sm text-surface-100 placeholder-surface-600 focus:border-primary-500 focus:outline-none"
              placeholder="tu@email.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-300">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-md border border-surface-700 bg-surface-900 px-3 py-2 text-sm text-surface-100 placeholder-surface-600 focus:border-primary-500 focus:outline-none"
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-md bg-primary-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
          >
            {isLoading ? "Ingresando…" : "Ingresar"}
          </button>
        </form>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-surface-800"></div>
          </div>
          <div className="relative flex justify-center text-xs text-surface-500">
            <span className="bg-surface-950 px-2">O</span>
          </div>
        </div>

        <GoogleLogin
          onSuccess={handleGoogleSuccess}
          onError={() => setError("Error con la autenticación de Google")}
          theme="filled_black"
          shape="rectangular"
          size="large"
          text="signin_with"
        />
      </div>
    </div>
  );
}
