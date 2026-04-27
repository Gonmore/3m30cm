require("react-native/Libraries/Core/InitializeCore");

const { registerRootComponent } = require("expo");
const App = require("./App").default;

registerRootComponent(App);