import expoBuildProperties from "expo-build-properties/plugin";
import expoFont from "expo-font/plugin";
import expoImage from "expo-image/plugin";
import expoLocalization from "expo-localization/plugin";
import expoNavigationBar from "expo-navigation-bar/plugin";
import expoRouter from "expo-router/plugin";
import expoSecureStore from "expo-secure-store/plugin";
import expoSharing from "expo-sharing/plugin";
import expoSplashScreen from "expo-splash-screen/plugin";
import expoStatusBar from "expo-status-bar/plugin";
import expoWebBrowser from "expo-web-browser/plugin";
import type { ConfigContext, ExpoConfig } from "expo/config";
import { version as APP_VERSION } from "./package.json" with { type: "json" };
// Static weights: React Native cannot pick a weight out of a variable font on Android.
import FONT_FILES from "./src/lib/theme/fonts.json" with { type: "json" };

// Dev builds get their own package and scheme so they install next to the release build.
const IS_DEV = process.env.APP_VARIANT === "development";
const APP_ID = IS_DEV ? "blog.omicron.app.dev" : "blog.omicron.app";
// Links to this host open in the app once omicron.blog/.well-known/assetlinks.json vouches for the signing key.
const LINK_HOST = "omicron.blog";
// Keep in step with IN_APP in src/lib/instance/app-links.ts.
const LINK_PATHS = [
  { pathPrefix: "/@" },
  { pathPrefix: "/tags/" },
  { pathPrefix: "/lists/" },
  { path: "/about" },
  { path: "/privacy" },
];
const EAS_PROJECT_ID = process.env.EAS_PROJECT_ID;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: IS_DEV ? "Omicron (Dev)" : "Omicron",
  slug: "omicron",
  version: APP_VERSION,
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: IS_DEV ? "omicron-dev" : "omicron",
  userInterfaceStyle: "automatic",
  ios: {
    supportsTablet: true,
    bundleIdentifier: APP_ID,
  },
  android: {
    adaptiveIcon: {
      backgroundColor: "#18181B",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    package: APP_ID,
    predictiveBackGestureEnabled: true,
    softwareKeyboardLayoutMode: "resize",
    allowBackup: false,
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        category: ["BROWSABLE", "DEFAULT"],
        data: LINK_PATHS.map((path) => ({ scheme: "https", host: LINK_HOST, ...path })),
      },
    ],
  },
  plugins: [
    expoStatusBar(),
    expoNavigationBar({ enforceContrast: false }),
    expoRouter(),
    expoSharing(),
    expoSecureStore(),
    expoWebBrowser(),
    expoFont({ fonts: FONT_FILES.map((file) => `./node_modules/${file}`) }),
    expoLocalization(),
    expoImage(),
    "@react-native-vector-icons/lucide",
    expoBuildProperties({
      android: {
        enableMinifyInReleaseBuilds: true,
        enableShrinkResourcesInReleaseBuilds: true,
      },
      ios: { useFrameworks: "static" },
    }),
    expoSplashScreen({
      image: "./assets/images/splash-light.png",
      imageWidth: 200,
      resizeMode: "contain",
      backgroundColor: "#ffffff",
      dark: {
        image: "./assets/images/splash-dark.png",
        backgroundColor: "#0d0d0d",
      },
    }),
  ],
  experiments: {
    reactCompiler: true,
  },
  extra: {
    router: {},
    ...(EAS_PROJECT_ID && { eas: { projectId: EAS_PROJECT_ID } }),
  },
  runtimeVersion: { policy: "appVersion" },
  updates: {
    enabled: Boolean(EAS_PROJECT_ID),
    ...(EAS_PROJECT_ID && { url: `https://u.expo.dev/${EAS_PROJECT_ID}` }),
  },
});
