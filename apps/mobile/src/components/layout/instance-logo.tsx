import { Image } from "expo-image";
import { useState } from "react";
import { useUniwind } from "uniwind";
import { useInstance } from "@/components/instance-provider";
import { useInstanceInfo } from "@/lib/query/instance";
import logoDark from "../../../assets/images/splash-dark.png";
import logoLight from "../../../assets/images/splash-light.png";

/** The admin's logo for this instance, else the built-in one (also when theirs can't load). */
export function InstanceLogo({ size }: { size: number }) {
  const { media } = useInstance();
  const { theme } = useUniwind();
  const { data: instance } = useInstanceInfo();
  const custom = media(instance?.logoUrl);
  const [failed, setFailed] = useState<string | undefined>();
  const source = custom && custom !== failed ? custom : theme === "dark" ? logoDark : logoLight;
  return (
    <Image
      source={source}
      contentFit="contain"
      onError={() => setFailed(custom)}
      style={{ width: size, height: size }}
      accessible={false}
    />
  );
}
