// Committed (unlike the generated expo-env.d.ts) so CI typechecks without running Expo first.
/// <reference types="expo/types" />

// Bundled images resolve to an asset id.
declare module "*.png" {
  const asset: number;
  export default asset;
}
