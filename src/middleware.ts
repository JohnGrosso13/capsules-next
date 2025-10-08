import { NextResponse } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const publicRoutes = [
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/_next/(.*)",
  "/cdn-cgi/(.*)",
  "/api/health(.*)",
  "/api/config(.*)",
  "/api/oauth/callback(.*)",
  "/api/webhooks/(.*)",
  "/api/uploads/r2/object/(.*)",
];

const isPublicRoute = createRouteMatcher(publicRoutes);

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) {
    return NextResponse.next();
  }
  const result = await auth();
  if (!result.userId) {
    return result.redirectToSignIn();
  }
});

export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next|_vercel).*)", "/(api|trpc)(.*)"],
};