import * as WebBrowser from "expo-web-browser";
import { routeIncomingLink } from "@/lib/instance/app-links";
import { readInstance } from "@/lib/instance/store";

// Runs before routing for every link Android hands the app (App Links and the omicron:// scheme).
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    const route = routeIncomingLink(path, readInstance()?.origin ?? null);
    // A Custom Tab, not Linking.openURL: the system browser would hand a verified link straight back to the app.
    if (route.browser) void WebBrowser.openBrowserAsync(route.browser);
    return route.path;
  } catch {
    return "/";
  }
}
