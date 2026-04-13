import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as NavigationBar from "expo-navigation-bar";
import { Platform } from "react-native";

if (Platform.OS === "android") {
  void NavigationBar.setBackgroundColorAsync("#000000");
  void NavigationBar.setButtonStyleAsync("light");
}

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "#0A1628" },
        }}
      />
    </>
  );
}