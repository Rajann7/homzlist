import { OwnProfile } from "@/components/profile/OwnProfile";

/** seller.homzlist.com/profile — Own Profile (P9 S1). Requires seller session (middleware). */
export const metadata = { title: "Profile" };

export default function ProfilePage() {
  return <OwnProfile />;
}
