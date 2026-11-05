import { useTheme } from "../contexts/ThemeContext";

export default function Footer() {
  const { theme } = useTheme();
  const logoSrc = theme === "dark" ? "/Logo_Blanco.png" : "/Logo_Azul.png";

  return (
    <footer className={`border-t px-4 py-4 ${theme === "dark" ? "border-surface-800 bg-black" : "border-gray-300 bg-white"}`}>
      <div className="mx-auto flex max-w-5xl items-center justify-center gap-2">
        <span className={`text-xs font-medium tracking-widest uppercase ${theme === "dark" ? "text-surface-400" : "text-gray-700"}`}>
          Powered
        </span>
        <span className={`flex h-3.5 w-3.5 items-center justify-center rounded-full text-[10px] font-bold ${theme === "dark" ? "border-surface-400 text-surface-400" : "border-gray-400 text-gray-700"}`}>
          by
        </span>
        <img
          src={logoSrc}
          alt="3m30cm"
          className="h-6 w-auto opacity-80"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.style.display = "none";
          }}
        />
      </div>
    </footer>
  );
}
