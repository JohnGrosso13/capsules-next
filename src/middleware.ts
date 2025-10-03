import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Public routes should exclude app pages that require authentication
const isPublicRoute = createRouteMatcher(["/", "/api/(.*)", "/_next/(.*)", "/api/webhooks/(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) {
    return;
  }
  const result = await auth();
  if (!result.userId) {
    return result.redirectToSignIn();
  }
});

export const config = {
  matcher: ["/((?!_next|_vercel|.*\\..*).*)"],
};
