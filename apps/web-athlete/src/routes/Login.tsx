import { useState } from "react";
import { GoogleLogin, type CredentialResponse } from "@react-oauth/google";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import Footer from "../components/Footer";

export default function Login() {
  const { login, loginWithGoogle } = useAuth();
  const { theme } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const bgImage = "/Login.jpeg?v=1";
  const overlayClass = theme === "dark" ? "bg-black/50" : "bg-white/40";
  const textColor = theme === "dark" ? "text-white" : "text-surface-100";
  const textSecondaryColor = theme === "dark" ? "text-surface-400" : "text-surface-500";

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
    <div className="relative flex min-h-screen flex-col">
      <div className="fixed inset-0 z-0">
        <img
          src={bgImage}
          alt=""
          className="h-full w-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
        <div className={`fixed inset-0 ${overlayClass}`} />
      </div>

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm space-y-6 rounded-2xl border border-surface-700/50 bg-surface-900/70 p-6 backdrop-blur-md">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-amber-400">3m30cm Atleta</h1>
            <p className={`mt-2 text-sm ${textSecondaryColor}`}>Tu app de entrenamiento de salto</p>
          </div>

          {error && (
            <div className="rounded-md bg-red-900/30 p-3 text-sm text-red-400">{error}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className={`block text-sm font-medium ${textSecondaryColor}`}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full rounded-md border border-surface-700 bg-surface-900/80 px-3 py-2 text-sm text-surface-100 placeholder-surface-600 focus:border-amber-500 focus:outline-none"
                placeholder="tu@email.com"
                required
              />
            </div>

            <div>
              <label className={`block text-sm font-medium ${textSecondaryColor}`}>Contraseña</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full rounded-md border border-surface-700 bg-surface-900/80 px-3 py-2 text-sm text-surface-100 placeholder-surface-600 focus:border-amber-500 focus:outline-none"
                placeholder="••••••••"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-md bg-amber-500 py-2.5 text-sm font-bold text-black transition-colors hover:bg-amber-400 disabled:opacity-50"
            >
              {isLoading ? "Ingresando…" : "Ingresar"}
            </button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-surface-800"></div>
            </div>
            <div className="relative flex justify-center text-xs text-surface-500">
              <span className="bg-surface-900/70 px-2">O</span>
            </div>
          </div>

          <div className="relative mx-auto h-10 w-48">
            <img src="/4109-google-color.png" alt="Iniciar sesión con Google" className="h-full w-full object-contain" />
            <div className="absolute inset-0 opacity-0">
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
        </div>
      </div>

      <div className="relative z-10">
        <Footer />
      </div>
    </div>
  );
}
