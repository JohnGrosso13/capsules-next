import { HomeSignedIn } from "@/components/home-signed-in";
import { loadHomeFeedAction } from "@/server/actions/home-feed";

export const metadata = {
  title: "Home | Capsules",
};

export default async function AuthenticatedHomePage() {
  const initialFeed = await loadHomeFeedAction();

  return (
    <HomeSignedIn
      initialPosts={initialFeed.posts}
      initialCursor={initialFeed.cursor}
      hydrationKey={initialFeed.hydrationKey}
    />
  );
}
