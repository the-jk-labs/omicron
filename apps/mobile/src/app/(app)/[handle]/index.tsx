import { useLocalSearchParams } from "expo-router";
import { ProfileView } from "@/components/profile/profile-view";
import { usernameFromHandle } from "@/lib/links";

export default function ProfileScreen() {
  const { handle } = useLocalSearchParams<{ handle: string }>();
  return <ProfileView username={usernameFromHandle(handle)} />;
}
