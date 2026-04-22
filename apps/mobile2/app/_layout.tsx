import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as NavigationBar from "expo-navigation-bar";
import * as Linking from "expo-linking";
import { useEffect } from "react";
import { Platform } from "react-native";
import { ThemeProvider, useTheme } from "@mobile/components/ThemeContext";

function AppShell() {
  const { mode, C } = useTheme();
  const router = useRouter();

  useEffect(() => {
    if (Platform.OS === "android") {
      void NavigationBar.setBackgroundColorAsync(C.bg);
      void NavigationBar.setButtonStyleAsync(mode === "dark" ? "light" : "dark");
    }
  }, [mode, C.bg]);

  // Handle deep links for password reset: jump30cm-game://reset-password?token=xxx
  useEffect(() => {
    function handleUrl({ url }: { url: string }) {
      const parsed = Linking.parse(url);
      if (parsed.path === "reset-password" && parsed.queryParams?.token) {
        const token = String(parsed.queryParams.token);
        router.push({ pathname: "/", params: { resetToken: token } });
      }
    }

    const subscription = Linking.addEventListener("url", handleUrl);

    Linking.getInitialURL().then((url) => {
      if (url) handleUrl({ url });
    }).catch(() => undefined);

    return () => subscription.remove();
  }, [router]);

  return (
    <>
      <StatusBar style={mode === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: C.bg },
        }}
      />
    </>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  );
}