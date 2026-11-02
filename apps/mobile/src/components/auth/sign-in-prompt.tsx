import { router } from "expo-router";
import { useEffect } from "react";
import { useViewer } from "@/lib/auth/session";
import { signInPrompt } from "@/lib/instance/store";
import { useStore } from "@/lib/store";

/** Opens sign-in once, right after an instance is chosen, unless that instance already knows this device. */
export function SignInPrompt() {
  const prompt = useStore(signInPrompt);
  const { signedIn, isPending } = useViewer();

  useEffect(() => {
    if (!prompt || isPending) return;
    signInPrompt.set(false);
    if (!signedIn) router.push({ pathname: "/sign-in", params: { welcome: "1" } });
  }, [prompt, isPending, signedIn]);

  return null;
}
