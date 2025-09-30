import { Suspense } from "react";

import { FriendsClient } from "./FriendsClient";

function FriendsPageContent() {
  return <FriendsClient />;
}

export default function FriendsPage() {
  return (
    <Suspense fallback={<div className="friends-loading">Loading friends...</div>}>
      <FriendsPageContent />
    </Suspense>
  );
}
