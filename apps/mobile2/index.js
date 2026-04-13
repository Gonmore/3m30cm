require("react-native/Libraries/Core/InitializeCore");

if (typeof globalThis.FormData === "undefined") {
  const ReactNativeFormData = require("react-native/Libraries/Network/FormData").default;
  globalThis.FormData = ReactNativeFormData;
  global.FormData = ReactNativeFormData;
}

const { registerRootComponent } = require("expo");
const App = require("./App").default;

registerRootComponent(App);