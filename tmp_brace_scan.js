const fs = require("fs");
const filePath = "apps/web/src/App.tsx";
const source = fs.readFileSync(filePath, "utf8");
const marker = "export default function App() {";
const start = source.indexOf(marker);
if (start < 0) {
  console.error("App marker not found");
  process.exit(1);
}
let i = start + marker.length;
let line = source.slice(0, i).split("\n").length;
let depth = 1;
let state = "code";
for (; i < source.length; i++) {
  const c = source[i];
  const n = source[i + 1];
  if (c === "\n") line++;

  if (state === "line") {
    if (c === "\n") state = "code";
    continue;
  }
  if (state === "block") {
    if (c === "*" && n === "/") {
      state = "code";
      i++;
    }
    continue;
  }
  if (state === "sq") {
    if (c === "\\") {
      i++;
      continue;
    }
    if (c === "'") state = "code";
    continue;
  }
  if (state === "dq") {
    if (c === "\\") {
      i++;
      continue;
    }
    if (c === '"') state = "code";
    continue;
  }
  if (state === "tpl") {
    if (c === "\\") {
      i++;
      continue;
    }
    if (c === "`") {
      state = "code";
      continue;
    }
    continue;
  }

  if (c === "/" && n === "/") {
    state = "line";
    i++;
    continue;
  }
  if (c === "/" && n === "*") {
    state = "block";
    i++;
    continue;
  }
  if (c === "'") {
    state = "sq";
    continue;
  }
  if (c === '"') {
    state = "dq";
    continue;
  }
  if (c === "`") {
    state = "tpl";
    continue;
  }

  if (c === "{") depth++;
  if (c === "}") {
    depth--;
    if (depth === 0) {
      console.log(`App closes at line ${line}`);
      process.exit(0);
    }
  }
}
console.log("Did not close App");
