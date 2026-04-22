import * as ImagePicker from "expo-image-picker";
import * as SecureStore from "expo-secure-store";
import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useMemo, useState } from "react";
import { useTheme, type ColorPalette } from "./ThemeContext";
import { R, S } from "./tokens";

interface ProfileModalProps {
  visible: boolean;
  onClose: () => void;
  /** JWT used to authenticate API requests */
  accessToken: string;
  /** Current avatar URL (from server) */
  avatarUrl?: string | null;
  /** Callback after a successful avatar upload */
  onAvatarChange?: (newUrl: string) => void;
  /** Whether the user signed in via OAuth (hides change-password option) */
  isOAuthUser?: boolean;
  /** API base URL */
  apiBase: string;
}

const makeStyles = (C: ColorPalette) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: C.overlay,
      justifyContent: "flex-end",
    },
    sheet: {
      backgroundColor: C.surface,
      borderTopLeftRadius: R.xl,
      borderTopRightRadius: R.xl,
      paddingHorizontal: S.lg,
      paddingTop: S.lg,
      paddingBottom: S.xl,
      gap: S.md,
      borderTopWidth: 1,
      borderColor: C.border,
    },
    handle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: C.borderStrong,
      alignSelf: "center",
      marginBottom: S.sm,
    },
    avatarRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: S.md,
      marginBottom: S.sm,
    },
    avatar: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: C.surfaceRaise,
      borderWidth: 2,
      borderColor: C.amber,
    },
    avatarPlaceholder: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: C.surfaceRaise,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 2,
      borderColor: C.amber,
    },
    avatarName: {
      color: C.text,
      fontSize: 17,
      fontWeight: "700",
    },
    avatarSub: {
      color: C.textMuted,
      fontSize: 13,
      marginTop: 2,
    },
    changePhotoBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: R.full,
      borderWidth: 1,
      borderColor: C.borderStrong,
      alignSelf: "flex-start",
    },
    changePhotoBtnText: {
      color: C.textSub,
      fontSize: 13,
      fontWeight: "600",
    },
    divider: {
      height: 1,
      backgroundColor: C.border,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: S.sm,
    },
    rowLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: S.sm,
    },
    rowLabel: {
      color: C.text,
      fontSize: 15,
      fontWeight: "600",
    },
    rowSub: {
      color: C.textMuted,
      fontSize: 12,
      marginTop: 1,
    },
    sectionTitle: {
      color: C.textMuted,
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 1.5,
      textTransform: "uppercase",
      marginBottom: -8,
    },
    input: {
      backgroundColor: C.surfaceRaise,
      borderRadius: R.md,
      paddingHorizontal: S.md,
      paddingVertical: 12,
      color: C.text,
      fontSize: 15,
      borderWidth: 1,
      borderColor: C.border,
    },
    pwRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: C.surfaceRaise,
      borderRadius: R.md,
      borderWidth: 1,
      borderColor: C.border,
    },
    pwInput: {
      flex: 1,
      paddingHorizontal: S.md,
      paddingVertical: 12,
      color: C.text,
      fontSize: 15,
    },
    pwToggle: {
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    primaryBtn: {
      backgroundColor: C.amber,
      borderRadius: R.full,
      paddingVertical: 13,
      alignItems: "center",
    },
    primaryBtnText: {
      color: C.bg,
      fontWeight: "800",
      fontSize: 15,
    },
    dangerBtn: {
      borderRadius: R.full,
      paddingVertical: 13,
      alignItems: "center",
      borderWidth: 1,
      borderColor: C.dangerBorder,
    },
    dangerBtnText: {
      color: C.danger,
      fontWeight: "700",
      fontSize: 15,
    },
    errorText: {
      color: C.danger,
      fontSize: 13,
      fontWeight: "600",
      textAlign: "center",
    },
    successText: {
      color: C.teal,
      fontSize: 13,
      fontWeight: "600",
      textAlign: "center",
    },
  });

export function ProfileModal({
  visible,
  onClose,
  accessToken,
  avatarUrl,
  onAvatarChange,
  isOAuthUser = false,
  apiBase,
}: ProfileModalProps) {
  const { mode, toggleTheme, C } = useTheme();
  const styles = useMemo(() => makeStyles(C), [C]);

  const [view, setView] = useState<"main" | "changePassword">("main");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Change-password form
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  function resetState() {
    setView("main");
    setError("");
    setSuccess("");
    setCurrentPassword("");
    setNewPassword("");
  }

  async function handlePickAvatar() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    const filename = asset.uri.split("/").pop() ?? "avatar.jpg";
    const type = asset.mimeType ?? "image/jpeg";

    const formData = new FormData();
    // React Native's FormData accepts this object format for file uploads
    (formData as unknown as { append(k: string, v: unknown): void }).append("avatar", {
      uri: asset.uri,
      name: filename,
      type,
    });

    try {
      setLoading(true);
      setError("");
      const res = await fetch(`${apiBase}/api/v1/athlete/me/avatar`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: formData,
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? "Error al subir la foto");
      }
      const body = (await res.json()) as { avatarUrl: string };
      onAvatarChange?.(body.avatarUrl);
      setSuccess("Foto actualizada");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al subir la foto");
    } finally {
      setLoading(false);
    }
  }

  async function handleChangePassword() {
    if (!currentPassword || !newPassword) {
      setError("Completa todos los campos");
      return;
    }
    if (newPassword.length < 8) {
      setError("La nueva contraseña debe tener al menos 8 caracteres");
      return;
    }
    try {
      setLoading(true);
      setError("");
      const res = await fetch(`${apiBase}/api/v1/auth/change-password`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? "Error al cambiar la contraseña");
      }
      setSuccess("Contraseña actualizada");
      setCurrentPassword("");
      setNewPassword("");
      setTimeout(() => setView("main"), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cambiar la contraseña");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    await SecureStore.deleteItemAsync("jump-token");
    onClose();
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={() => { resetState(); onClose(); }}
    >
      <Pressable style={styles.overlay} onPress={() => { resetState(); onClose(); }}>
        <Pressable style={styles.sheet} onPress={() => { /* prevent close */ }}>
          <View style={styles.handle} />

          {view === "main" ? (
            <>
              {/* Avatar row */}
              <View style={styles.avatarRow}>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Ionicons name="person" size={28} color={C.textMuted} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Pressable style={styles.changePhotoBtn} onPress={() => void handlePickAvatar()} disabled={loading}>
                    {loading ? (
                      <ActivityIndicator size="small" color={C.amber} />
                    ) : (
                      <>
                        <Ionicons name="camera-outline" size={16} color={C.textSub} />
                        <Text style={styles.changePhotoBtnText}>Cambiar foto</Text>
                      </>
                    )}
                  </Pressable>
                </View>
              </View>

              {(error || success) && (
                <Text style={error ? styles.errorText : styles.successText}>{error || success}</Text>
              )}

              <View style={styles.divider} />

              {/* Theme toggle */}
              <Text style={styles.sectionTitle}>Apariencia</Text>
              <Pressable style={styles.row} onPress={toggleTheme}>
                <View style={styles.rowLeft}>
                  <Ionicons
                    name={mode === "dark" ? "moon" : "sunny"}
                    size={22}
                    color={C.amber}
                  />
                  <View>
                    <Text style={styles.rowLabel}>
                      {mode === "dark" ? "Modo oscuro" : "Modo claro"}
                    </Text>
                    <Text style={styles.rowSub}>Toca para cambiar</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={C.textMuted} />
              </Pressable>

              <View style={styles.divider} />

              {/* Change password (only for non-OAuth users) */}
              {!isOAuthUser && (
                <>
                  <Text style={styles.sectionTitle}>Seguridad</Text>
                  <Pressable style={styles.row} onPress={() => { setError(""); setSuccess(""); setView("changePassword"); }}>
                    <View style={styles.rowLeft}>
                      <Ionicons name="lock-closed-outline" size={22} color={C.teal} />
                      <View>
                        <Text style={styles.rowLabel}>Cambiar contraseña</Text>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={C.textMuted} />
                  </Pressable>
                  <View style={styles.divider} />
                </>
              )}

              {/* Logout */}
              <Pressable style={styles.dangerBtn} onPress={() => void handleLogout()}>
                <Text style={styles.dangerBtnText}>Cerrar sesión</Text>
              </Pressable>
            </>
          ) : (
            <>
              {/* Change password view */}
              <Pressable onPress={() => { setError(""); setSuccess(""); setView("main"); }} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Ionicons name="arrow-back" size={20} color={C.textMuted} />
                <Text style={{ color: C.textMuted, fontSize: 14 }}>Volver</Text>
              </Pressable>

              <Text style={{ color: C.text, fontSize: 18, fontWeight: "700" }}>Cambiar contraseña</Text>

              <View style={styles.pwRow}>
                <TextInput
                  secureTextEntry={!showCurrent}
                  placeholder="Contraseña actual"
                  placeholderTextColor={C.textDisabled}
                  style={styles.pwInput}
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                />
                <Pressable style={styles.pwToggle} onPress={() => setShowCurrent((v) => !v)}>
                  <Ionicons name={showCurrent ? "eye-off" : "eye"} size={20} color={C.textMuted} />
                </Pressable>
              </View>

              <View style={styles.pwRow}>
                <TextInput
                  secureTextEntry={!showNew}
                  placeholder="Nueva contraseña (mín. 8 caracteres)"
                  placeholderTextColor={C.textDisabled}
                  style={styles.pwInput}
                  value={newPassword}
                  onChangeText={setNewPassword}
                />
                <Pressable style={styles.pwToggle} onPress={() => setShowNew((v) => !v)}>
                  <Ionicons name={showNew ? "eye-off" : "eye"} size={20} color={C.textMuted} />
                </Pressable>
              </View>

              {(error || success) && (
                <Text style={error ? styles.errorText : styles.successText}>{error || success}</Text>
              )}

              <Pressable
                style={[styles.primaryBtn, (loading || newPassword.length < 8) && { opacity: 0.5 }]}
                onPress={() => void handleChangePassword()}
                disabled={loading || newPassword.length < 8}
              >
                {loading ? (
                  <ActivityIndicator color={C.bg} />
                ) : (
                  <Text style={styles.primaryBtnText}>Guardar contraseña</Text>
                )}
              </Pressable>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
