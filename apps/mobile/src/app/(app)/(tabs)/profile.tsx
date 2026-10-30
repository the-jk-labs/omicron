import { ProfileView } from "@/components/profile/profile-view";
import { useViewer } from "@/lib/auth/session";

export default function OwnProfile() {
  const { user } = useViewer();
  return user ? <ProfileView username={user.username} isTab /> : null;
}
