import { Suspense } from "react";

import { FriendsPageProviders } from "./FriendsPageProviders";

function FriendsPageContent() {
  return <FriendsPageProviders />;
}

export default function FriendsPage() {
  return (
    <Suspense fallback={<div className="friends-loading">Loading friends...</div>}>
      <FriendsPageContent />
    </Suspense>
  );
}
