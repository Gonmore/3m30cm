import { useEffect, useState } from "react";

import { resolveAssetUrl, type AuthUser } from "../contexts/AuthContext";

interface AvatarProps {
  user: Pick<AuthUser, "firstName" | "email" | "avatarUrl"> | null;
  /** Tailwind size classes, e.g. "h-8 w-8". */
  sizeClass?: string;
  textClass?: string;
}

export default function Avatar({ user, sizeClass = "h-8 w-8", textClass = "text-sm" }: AvatarProps) {
  const src = resolveAssetUrl(user?.avatarUrl);
  const [failed, setFailed] = useState(false);

  // A new photo should get a fresh chance to load.
  useEffect(() => setFailed(false), [src]);

  if (src && !failed) {
    return (
      <img
        src={src}
        alt="Foto de perfil"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={`${sizeClass} shrink-0 rounded-full object-cover`}
      />
    );
  }

  const initial = (user?.firstName?.[0] ?? user?.email?.[0] ?? "?").toUpperCase();
  return (
    <span
      className={`${sizeClass} ${textClass} flex shrink-0 items-center justify-center rounded-full bg-amber-600 font-bold text-white`}
    >
      {initial}
    </span>
  );
}
