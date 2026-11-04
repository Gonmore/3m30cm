import { useTheme } from "../contexts/ThemeContext";

export default function Footer() {
  const { theme } = useTheme();
  const logoSrc = theme === "dark" ? "/Logo_Blanco.png" : "/Logo_Azul.png";

  return (
    <footer className="border-t border-surface-800 bg-surface-950 py-3">
      <div className="mx-auto flex max-w-5xl items-center justify-center gap-2 px-4">
        <span className="text-xs font-medium tracking-widest text-surface-500 uppercase">
          Powered
        </span>
        <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-surface-500 text-[10px] text-surface-500">
          by
        </span>
        <img
          src={logoSrc}
          alt="3m30cm"
          className="h-6 w-auto opacity-40"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.style.display = "none";
          }}
        />
      </div>
    </footer>
  );
}
