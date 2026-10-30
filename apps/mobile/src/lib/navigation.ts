import { router } from "expo-router";

/** Back, or to Home when the screen was opened directly (a link, a notification). */
export const goBack = () => (router.canGoBack() ? router.back() : router.replace("/"));
