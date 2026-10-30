const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");
const { withUniwindConfig } = require("uniwind/metro");

const config = getDefaultConfig(__dirname);

// The API contract lives outside the app (packages/contract, linked in package.json), so Metro watches it too.
const contract = path.resolve(__dirname, "../../packages/contract");
config.watchFolders = [...(config.watchFolders ?? []), contract];

// The contract's own imports (zod) resolve from the app, so the bundle carries one zod rather than two.
const resolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const fromContract = context.originModulePath.startsWith(contract + path.sep);
  const next = fromContract && !moduleName.startsWith(".") ? { ...context, originModulePath: __filename } : context;
  return (resolveRequest ?? context.resolveRequest)(next, moduleName, platform);
};

module.exports = withUniwindConfig(config, {
  cssEntryFile: "./src/global.css",
  dtsFile: "./uniwind-types.d.ts",
});
