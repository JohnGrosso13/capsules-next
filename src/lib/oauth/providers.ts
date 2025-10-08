export type OAuthProviderConfig = {
  authUrl: string;
  tokenUrl: string;
  params: Record<string, string>;
  clientId: string;
  clientSecret?: string;
  requiresVerifier?: boolean;
};

function assertClient(provider: string, clientId?: string | null, clientSecret?: string | null) {
  if (!clientId || !clientSecret) {
    throw new Error(`${provider.toUpperCase()} client credentials not configured`);
  }
  return { clientId, clientSecret };
}

export function getOAuthProviderConfig(provider: string): OAuthProviderConfig {
  const key = provider.toLowerCase();
  switch (key) {
    case "youtube": {
      const { clientId, clientSecret } = assertClient(
        "youtube",
        process.env.YOUTUBE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID,
        process.env.YOUTUBE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET,
      );
      return {
        authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        params: {
          client_id: clientId,
          response_type: "code",
          scope: "https://www.googleapis.com/auth/youtube.upload openid email profile",
          access_type: "offline",
          include_granted_scopes: "true",
          prompt: "consent",
        },
        clientId,
        clientSecret,
      };
    }
    case "instagram": {
      const { clientId, clientSecret } = assertClient(
        "instagram",
        process.env.INSTAGRAM_CLIENT_ID,
        process.env.INSTAGRAM_CLIENT_SECRET,
      );
      return {
        authUrl: "https://api.instagram.com/oauth/authorize",
        tokenUrl: "https://api.instagram.com/oauth/access_token",
        params: {
          client_id: clientId,
          response_type: "code",
          scope: "user_profile,user_media",
        },
        clientId,
        clientSecret,
      };
    }
    case "x":
    case "twitter": {
      const { clientId, clientSecret } = assertClient(
        "twitter",
        process.env.TWITTER_CLIENT_ID || process.env.X_CLIENT_ID,
        process.env.TWITTER_CLIENT_SECRET || process.env.X_CLIENT_SECRET,
      );
      return {
        authUrl: "https://twitter.com/i/oauth2/authorize",
        tokenUrl: "https://api.twitter.com/2/oauth2/token",
        params: {
          client_id: clientId,
          response_type: "code",
          scope: "tweet.read tweet.write users.read offline.access",
          code_challenge_method: "plain",
        },
        clientId,
        clientSecret,
        requiresVerifier: true,
      };
    }
    case "tiktok": {
      const { clientId, clientSecret } = assertClient(
        "tiktok",
        process.env.TIKTOK_CLIENT_ID,
        process.env.TIKTOK_CLIENT_SECRET,
      );
      return {
        authUrl: "https://www.tiktok.com/v2/auth/authorize/",
        tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
        params: {
          client_key: clientId,
          response_type: "code",
          scope: "user.info.basic,video.upload",
        },
        clientId,
        clientSecret,
      };
    }
    case "facebook": {
      const { clientId, clientSecret } = assertClient(
        "facebook",
        process.env.FACEBOOK_CLIENT_ID,
        process.env.FACEBOOK_CLIENT_SECRET,
      );
      return {
        authUrl: "https://www.facebook.com/v18.0/dialog/oauth",
        tokenUrl: "https://graph.facebook.com/v18.0/oauth/access_token",
        params: {
          client_id: clientId,
          response_type: "code",
          scope:
            "public_profile,pages_show_list,pages_read_engagement,pages_manage_posts,pages_read_user_content",
        },
        clientId,
        clientSecret,
      };
    }
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}
