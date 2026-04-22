import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { R, S } from "./tokens";
import { useTheme } from "./ThemeContext";

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  onMenuPress: () => void;
  athleteInitials: string;
  onAvatarPress?: () => void;
  avatarUrl?: string | null;
}

export default function AppHeader({ title, subtitle, onMenuPress, athleteInitials, onAvatarPress, avatarUrl }: AppHeaderProps) {
  const insets = useSafeAreaInsets();
  const { C } = useTheme();
  const styles = makeStyles(C);

  return (
    <View style={[styles.root, { paddingTop: insets.top + S.xs }]}>
      {/* Hamburger */}
      <Pressable
        style={styles.iconBtn}
        onPress={onMenuPress}
        hitSlop={8}
      >
        <View style={styles.barLine} />
        <View style={styles.barLine} />
        <View style={[styles.barLine, styles.barLineShort]} />
      </Pressable>

      {/* Title block */}
      <View style={styles.titleBlock}>
        <Text style={styles.titleText} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitleText} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {/* Avatar */}
      <Pressable style={styles.avatar} hitSlop={8} onPress={onAvatarPress}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
        ) : (
          <Text style={styles.avatarText}>{athleteInitials}</Text>
        )}
      </Pressable>
    </View>
  );
}

function makeStyles(C: ReturnType<typeof useTheme>["C"]) {
  return StyleSheet.create({
    root: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: C.surface,
      paddingBottom: S.sm + 2,
      paddingHorizontal: S.md,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
      gap: S.md,
    },
    iconBtn: {
      width: 36,
      height: 36,
      alignItems: "flex-start",
      justifyContent: "center",
      gap: 5,
      flexShrink: 0,
    },
    barLine: {
      width: 22,
      height: 2,
      borderRadius: R.full,
      backgroundColor: C.text,
    },
    barLineShort: {
      width: 14,
    },
    titleBlock: {
      flex: 1,
      gap: 1,
    },
    titleText: {
      color: C.text,
      fontSize: 17,
      fontWeight: "700",
      letterSpacing: 0.4,
    },
    subtitleText: {
      color: C.textMuted,
      fontSize: 12,
    },
    avatar: {
      width: 36,
      height: 36,
      borderRadius: R.full,
      backgroundColor: C.amber,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      overflow: "hidden",
    },
    avatarImage: {
      width: 36,
      height: 36,
      borderRadius: R.full,
    },
    avatarText: {
      color: C.bg,
      fontWeight: "800",
      fontSize: 14,
      letterSpacing: 0.5,
    },
  });
}
