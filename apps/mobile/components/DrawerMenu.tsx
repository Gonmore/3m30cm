import { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { R, S } from "./tokens";
import { useTheme } from "./ThemeContext";
import type { ColorPalette } from "./ThemeContext";

export type AppScreen = "hoy" | "ejercicios" | "programa" | "evolucion";

interface DrawerMenuProps {
  open: boolean;
  onClose: () => void;
  activeScreen: AppScreen;
  onNavigate: (screen: AppScreen) => void;
  athleteName: string;
  athleteEmail: string;
}

const DRAWER_WIDTH = 280;

const menuItems: { screen: AppScreen; icon: string; label: string }[] = [
  { screen: "hoy",        icon: "◉", label: "Hoy"        },
  { screen: "ejercicios", icon: "⚡", label: "Ejercicios" },
  { screen: "programa",   icon: "▤",  label: "Programa"   },
  { screen: "evolucion",  icon: "↑",  label: "Evolución"  },
];

export default function DrawerMenu({
  open,
  onClose,
  activeScreen,
  onNavigate,
  athleteName,
  athleteEmail,
}: DrawerMenuProps) {
  const insets = useSafeAreaInsets();
  const { C } = useTheme();
  const styles = makeStyles(C);
  const translateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const opacity    = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateX, {
        toValue: open ? 0 : -DRAWER_WIDTH,
        duration: 280,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: open ? 1 : 0,
        duration: 240,
        useNativeDriver: true,
      }),
    ]).start();
  }, [open, translateX, opacity]);

  if (!open) {
    // Keep rendered but invisible so animation can play
    return (
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFillObject, { opacity }]}
      >
        <View style={styles.overlay} />
        <Animated.View style={[styles.drawer, { transform: [{ translateX }], paddingTop: insets.top + S.sm }]}>
          {null}
        </Animated.View>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[StyleSheet.absoluteFillObject, { opacity }]}>
      {/* Overlay – tap to close */}
      <Pressable style={styles.overlay} onPress={onClose} />

      {/* Drawer panel */}
      <Animated.View
        style={[styles.drawer, { transform: [{ translateX }], paddingTop: insets.top + S.sm }]}
      >
        {/* Profile header */}
        <View style={styles.profileHeader}>
          <View style={styles.profileAvatar}>
            <Text style={styles.profileAvatarText}>
              {athleteName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "A"}
            </Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName} numberOfLines={1}>{athleteName}</Text>
            <Text style={styles.profileEmail} numberOfLines={1}>{athleteEmail}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Menu items */}
        {menuItems.map(({ screen, icon, label }) => {
          const isActive = activeScreen === screen;
          return (
            <Pressable
              key={screen}
              style={[styles.menuItem, isActive && styles.menuItemActive]}
              onPress={() => { onNavigate(screen); onClose(); }}
            >
              <Text style={[styles.menuIcon, isActive && styles.menuIconActive]}>{icon}</Text>
              <Text style={[styles.menuLabel, isActive && styles.menuLabelActive]}>{label}</Text>
              {isActive && <View style={styles.activeBar} />}
            </Pressable>
          );
        })}
      </Animated.View>
    </Animated.View>
  );
}

function makeStyles(C: ColorPalette) {
  return StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: C.overlay,
    },
    drawer: {
      position: "absolute",
      top: 0,
      bottom: 0,
      left: 0,
      width: DRAWER_WIDTH,
      backgroundColor: C.drawerBg,
      borderRightWidth: 1,
      borderRightColor: C.borderStrong,
      paddingHorizontal: S.md,
      paddingBottom: S.xl,
      gap: S.xs,
    },
    profileHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: S.sm,
      paddingVertical: S.sm,
      paddingHorizontal: S.xs,
      marginBottom: S.xs,
    },
    profileAvatar: {
      width: 44,
      height: 44,
      borderRadius: R.full,
      backgroundColor: C.amber,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    profileAvatarText: {
      color: C.bg,
      fontWeight: "800",
      fontSize: 16,
    },
    profileInfo: {
      flex: 1,
      gap: 2,
    },
    profileName: {
      color: C.text,
      fontWeight: "700",
      fontSize: 15,
    },
    profileEmail: {
      color: C.textMuted,
      fontSize: 12,
    },
    divider: {
      height: 1,
      backgroundColor: C.border,
      marginVertical: S.xs,
    },
    menuItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: S.sm,
      paddingVertical: 14,
      paddingHorizontal: S.sm,
      borderRadius: R.md,
      position: "relative",
    },
    menuItemActive: {
      backgroundColor: C.amberDim,
    },
    menuIcon: {
      fontSize: 18,
      width: 26,
      textAlign: "center",
      color: C.textMuted,
    },
    menuIconActive: {
      color: C.amber,
    },
    menuLabel: {
      fontSize: 16,
      fontWeight: "600",
      color: C.textSub,
      flex: 1,
    },
    menuLabelActive: {
      color: C.amber,
    },
    activeBar: {
      position: "absolute",
      right: 0,
      top: "25%",
      bottom: "25%",
      width: 3,
      borderRadius: R.full,
      backgroundColor: C.amber,
    },
  });
}

