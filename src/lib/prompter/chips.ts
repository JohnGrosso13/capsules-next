import type {
  PrompterChipOption,
} from "@/components/prompter/hooks/usePrompterStageController";

export const HOME_COMPOSER_CHIPS: PrompterChipOption[] = [
  {
    id: "home_daily_update",
    surface: "home",
    label: "Daily Update",
    handoff: {
      intent: "ai_prompt",
      prompt:
        "Let's write today's update for your community. What happened recently that you'd like to share or highlight?",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "daily_update", prefillOnly: true },
      },
    },
  },
  {
    id: "home_community_poll",
    surface: "home",
    label: "Community Poll",
    handoff: {
      intent: "ai_prompt",
      prompt:
        "Let's create a poll for your community. What do you want to ask, and who should be able to vote?",
      options: {
        composeMode: "poll",
        prefer: "poll",
        extras: { replyMode: "chat", chipId: "community_poll", prefillOnly: true },
      },
    },
  },
  {
    id: "home_announcement",
    surface: "home",
    label: "Announcement",
    handoff: {
      intent: "ai_prompt",
      prompt:
        "Got news to share. What's the announcement, who is it for, and when does it take effect?",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "announcement", prefillOnly: true },
      },
    },
  },
  {
    id: "home_new_style",
    surface: "home",
    label: "New Style",
    handoff: {
      intent: "ai_prompt",
      prompt:
        "Time for a fresh look. Describe the vibe or theme you want for this capsule, plus any colors or inspirations you like.",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "new_style", prefillOnly: true },
      },
    },
  },
  {
    id: "home_shoutout",
    surface: "home",
    label: "Shoutout",
    handoff: {
      intent: "ai_prompt",
      prompt:
        "Let's craft a shoutout. Who do you want to highlight, and what did they do that deserves recognition?",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "shoutout", prefillOnly: true },
      },
    },
  },
  {
    id: "home_qotd",
    surface: "home",
    label: "Question of the Day",
    handoff: {
      intent: "ai_prompt",
      prompt:
        "Let's write a question of the day. What topic or theme should we spark conversation around?",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "question_of_day", prefillOnly: true },
      },
    },
  },
];

export const EXPLORE_COMPOSER_CHIPS: PrompterChipOption[] = [
  {
    id: "explore_discover_new",
    surface: "explore",
    label: "Discover New Capsules",
    handoff: {
      intent: "ai_prompt",
      prompt:
        "Let's find new capsules to explore. What topics, vibes, or goals are you most interested in?",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "explore_discover_new", prefillOnly: true },
      },
    },
  },
  {
    id: "explore_friends_capsules",
    surface: "explore",
    label: "Friends' Capsules",
    handoff: {
      intent: "ai_prompt",
      prompt:
        "Let's see where your friends are hanging out. Share a few names, handles, or groups you want to check.",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "explore_friends_capsules", prefillOnly: true },
      },
    },
  },
  {
    id: "explore_trending_now",
    surface: "explore",
    label: "Trending Now",
    handoff: {
      intent: "ai_prompt",
      prompt:
        "Let's browse what's trending. Are you in the mood for creators, gaming, events, or something else?",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "explore_trending_now", prefillOnly: true },
      },
    },
  },
  {
    id: "explore_upcoming_events",
    surface: "explore",
    label: "Upcoming Events",
    handoff: {
      intent: "ai_prompt",
      prompt:
        "Let's look for upcoming events to join. When are you free, and what kind of events do you care about?",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "explore_upcoming_events", prefillOnly: true },
      },
    },
  },
  {
    id: "explore_recommend_for_me",
    surface: "explore",
    label: "Recommend For Me",
    handoff: {
      intent: "ai_prompt",
      prompt:
        "Help me recommend capsules that fit you. What are your interests, and how active do you want the community to be?",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "explore_recommend_for_me", prefillOnly: true },
      },
    },
  },
  {
    id: "explore_hidden_gems",
    surface: "explore",
    label: "Hidden Gems",
    handoff: {
      intent: "ai_prompt",
      prompt:
        "Let's uncover some hidden-gem capsules. What niche or kind of community feels like a good fit for you?",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "explore_hidden_gems", prefillOnly: true },
      },
    },
  },
];

export const CREATE_COMPOSER_CHIPS: PrompterChipOption[] = [
  {
    id: "create_content_plan",
    surface: "create",
    label: "Content Plan",
    handoff: {
      intent: "ai_prompt",
      prompt:
        "Let's sketch a simple content plan. What's your main theme, and how often do you want to post?",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "create_content_plan", prefillOnly: true },
      },
    },
  },
  {
    id: "create_launch_post",
    surface: "create",
    label: "Launch Post",
    handoff: {
      intent: "ai_prompt",
      prompt:
        "Let's draft a launch post. What are you launching, who is it for, and what do you want people to do?",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "create_launch_post", prefillOnly: true },
      },
    },
  },
  {
    id: "create_community_poll",
    surface: "create",
    label: "Community Poll",
    handoff: {
      intent: "ai_prompt",
      prompt:
        "Let's set up a community poll. What's the question, and what are a few options people should choose from?",
      options: {
        composeMode: "poll",
        prefer: "poll",
        extras: { replyMode: "chat", chipId: "create_community_poll", prefillOnly: true },
      },
    },
  },
  {
    id: "create_logo_banner",
    surface: "create",
    label: "Logo + Banner",
    handoff: {
      intent: "ai_prompt",
      prompt:
        "Let's brainstorm a logo and banner. Describe the vibe, colors, and any references or inspirations you like.",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "create_logo_banner", prefillOnly: true },
      },
    },
  },
  {
    id: "create_tournament_setup",
    surface: "create",
    label: "Tournament Setup",
    handoff: {
      intent: "ai_prompt",
      prompt:
        "Let's plan a tournament. What game or format is it, when will it run, and are there any prizes or special rules?",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "create_tournament_setup", prefillOnly: true },
      },
    },
  },
  {
    id: "create_stream_highlights",
    surface: "create",
    label: "Stream Highlights",
    handoff: {
      intent: "ai_prompt",
      prompt:
        "Let's turn your last stream into highlights. What was the stream about, and which moments do you want to feature?",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "create_stream_highlights", prefillOnly: true },
      },
    },
  },
];

export const CAPSULE_COMPOSER_CHIPS: PrompterChipOption[] = [
  {
    id: "capsule_recap",
    surface: "capsule",
    label: "Capsule Recap",
    handoff: {
      intent: "ai_prompt",
      prompt:
        "Let's write a quick recap for this capsule. What recent events, wins, or updates should we mention?",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "capsule_recap", prefillOnly: true },
      },
    },
  },
  {
    id: "capsule_event_reminder",
    surface: "capsule",
    label: "Event Reminder",
    handoff: {
      intent: "ai_prompt",
      prompt:
        "Let's draft an event reminder. What's the event, when is it, and who should be invited?",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "capsule_event_reminder", prefillOnly: true },
      },
    },
  },
  {
    id: "capsule_welcome_new_members",
    surface: "capsule",
    label: "Welcome New Members",
    handoff: {
      intent: "ai_prompt",
      prompt:
        "Let's welcome new members. Who just joined, and what should they know first about this capsule?",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "capsule_welcome_new_members", prefillOnly: true },
      },
    },
  },
  {
    id: "capsule_store_drop",
    surface: "capsule",
    label: "Store Drop",
    handoff: {
      intent: "ai_prompt",
      prompt:
        "Let's announce a new store drop. What's launching, what makes it special, and what should people do next?",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "capsule_store_drop", prefillOnly: true },
      },
    },
  },
  {
    id: "capsule_style_refresh",
    surface: "capsule",
    label: "Style Refresh",
    handoff: {
      intent: "ai_prompt",
      prompt:
        "Let's refresh this capsule's style. Describe the vibe, colors, or references you'd like it to match.",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "capsule_style_refresh", prefillOnly: true },
      },
    },
  },
  {
    id: "capsule_pinned_update",
    surface: "capsule",
    label: "Pinned Update",
    handoff: {
      intent: "ai_prompt",
      prompt:
        "Let's write a pin-worthy update. What's the key message, who is it for, and what do you want people to do after reading?",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "capsule_pinned_update", prefillOnly: true },
      },
    },
  },
];


export const MEMORY_COMPOSER_CHIPS: PrompterChipOption[] = [
  {
    id: "memory_find_past_post",
    surface: "memory",
    label: "Find a Past Post",
    handoff: {
      intent: "ai_prompt",
      prompt:
        "Help me find a past post. What keywords, people, or timeframe should we search for?",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "memory_find_past_post", prefillOnly: true },
      },
    },
  },
  {
    id: "memory_summarize_recent_uploads",
    surface: "memory",
    label: "Summarize Recent Uploads",
    handoff: {
      intent: "ai_prompt",
      prompt:
        "Let's summarize some recent uploads. Which files or date range should we focus on, and what do you want out of the summary?",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "memory_summarize_recent_uploads", prefillOnly: true },
      },
    },
  },
  {
    id: "memory_create_faq_from_docs",
    surface: "memory",
    label: "Create FAQ from Docs",
    handoff: {
      intent: "ai_prompt",
      prompt:
        "Let's turn your docs into a quick FAQ. Which files should we use, and who is the FAQ for?",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "memory_create_faq_from_docs", prefillOnly: true },
      },
    },
  },
  {
    id: "memory_key_clips_recap",
    surface: "memory",
    label: "Key Clips Recap",
    handoff: {
      intent: "ai_prompt",
      prompt:
        "Let's pull out key clips. Which stream or video should we look at, and are you aiming for short highlights or a longer recap?",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "memory_key_clips_recap", prefillOnly: true },
      },
    },
  },
  {
    id: "memory_sponsor_mentions",
    surface: "memory",
    label: "Sponsor Mentions",
    handoff: {
      intent: "ai_prompt",
      prompt:
        "Let's track sponsor mentions. Which sponsors or terms should we look for, and over what time period?",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "memory_sponsor_mentions", prefillOnly: true },
      },
    },
  },
  {
    id: "memory_asset_pack",
    surface: "memory",
    label: "Asset Pack",
    handoff: {
      intent: "ai_prompt",
      prompt:
        "Let's assemble a small asset pack. Which images or videos should be included, and where will you use them?",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "memory_asset_pack", prefillOnly: true },
      },
    },
  },
];

export const PROFILE_COMPOSER_CHIPS: PrompterChipOption[] = [
  {
    id: "profile_rewrite_bio",
    surface: "profile",
    label: "Rewrite Bio",
    handoff: {
      intent: "ai_prompt",
      prompt:
        "Let's refresh your bio. How would you like to sound, and what key points about you should we include?",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "profile_rewrite_bio", prefillOnly: true },
      },
    },
  },
  {
    id: "profile_pitch",
    surface: "profile",
    label: "Profile Pitch",
    handoff: {
      intent: "ai_prompt",
      prompt:
        "Let's craft a short profile pitch. Who do you want to reach, and what do you want them to do—follow, collaborate, or something else?",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "profile_pitch", prefillOnly: true },
      },
    },
  },
  {
    id: "profile_media_highlight",
    surface: "profile",
    label: "Media Highlight",
    handoff: {
      intent: "ai_prompt",
      prompt:
        "Let's feature a highlight on your profile. Which post or piece of media should we spotlight, and what's the main takeaway?",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "profile_media_highlight", prefillOnly: true },
      },
    },
  },
  {
    id: "profile_intro_post",
    surface: "profile",
    label: "Intro Post",
    handoff: {
      intent: "ai_prompt",
      prompt:
        "Let's write an intro post. What roles or projects should we mention, and what invitation do you want to give people?",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "profile_intro_post", prefillOnly: true },
      },
    },
  },
  {
    id: "profile_link_copy",
    surface: "profile",
    label: "Link Copy",
    handoff: {
      intent: "ai_prompt",
      prompt:
        "Let's write copy for your links. Which links (portfolio, store, stream, etc.) and what angle do you want—value, credibility, or a clear CTA?",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "profile_link_copy", prefillOnly: true },
      },
    },
  },
  {
    id: "profile_theme_vibe",
    surface: "profile",
    label: "Theme Vibe",
    handoff: {
      intent: "ai_prompt",
      prompt:
        "Let's define your profile's vibe. Share a few colors, references, or adjectives that feel most like you.",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "profile_theme_vibe", prefillOnly: true },
      },
    },
  },
];

export const SETTINGS_COMPOSER_CHIPS: PrompterChipOption[] = [
  {
    id: "settings_switch_theme",
    surface: "settings",
    label: "Switch Theme",
    handoff: {
      intent: "ai_prompt",
      prompt:
        "Let's switch up your theme. Do you prefer light, dark, or a specific vibe or color palette?",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "settings_switch_theme", prefillOnly: true },
      },
    },
  },
  {
    id: "settings_tune_notifications",
    surface: "settings",
    label: "Tune Notifications",
    handoff: {
      intent: "ai_prompt",
      prompt:
        "Let's tune your notifications. Which events matter most to you—mentions, follows, DMs, or something else?",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "settings_tune_notifications", prefillOnly: true },
      },
    },
  },
  {
    id: "settings_update_bio",
    surface: "settings",
    label: "Update Bio",
    handoff: {
      intent: "ai_prompt",
      prompt:
        "Let's make a quick bio update. What's changed or what should be emphasized now?",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "settings_update_bio", prefillOnly: true },
      },
    },
  },
  {
    id: "settings_access_roles",
    surface: "settings",
    label: "Access & Roles",
    handoff: {
      intent: "ai_prompt",
      prompt:
        "Let's adjust access and roles. Who needs access, and what level should they have—admin, mod, or member?",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "settings_access_roles", prefillOnly: true },
      },
    },
  },
  {
    id: "settings_voice_ai",
    surface: "settings",
    label: "Voice & AI Settings",
    handoff: {
      intent: "ai_prompt",
      prompt:
        "Let's adjust voice and AI settings. Do you want voice input on, and should AI replies be short or more detailed?",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "settings_voice_ai", prefillOnly: true },
      },
    },
  },
  {
    id: "settings_privacy_checkup",
    surface: "settings",
    label: "Privacy Checkup",
    handoff: {
      intent: "ai_prompt",
      prompt:
        "Let's do a quick privacy checkup. What should be public, members-only, or hidden?",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "settings_privacy_checkup", prefillOnly: true },
      },
    },
  },
];

export const LIVE_COMPOSER_CHIPS: PrompterChipOption[] = [
  {
    id: "live_ask_streamer",
    surface: "live",
    label: "Ask the Streamer",
    handoff: {
      intent: "ai_prompt",
      prompt:
        "Let's send a question to the streamer. What do you want to ask, and should it be serious or just for fun?",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "live_ask_streamer", prefillOnly: true },
      },
    },
  },
  {
    id: "live_clip_this_moment",
    surface: "live",
    label: "Clip This Moment",
    handoff: {
      intent: "ai_prompt",
      prompt:
        "Let's clip this moment from the stream. What just happened, and roughly how much before and after should we capture?",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "live_clip_this_moment", prefillOnly: true },
      },
    },
  },
  {
    id: "live_stream_recap",
    surface: "live",
    label: "Stream Recap So Far",
    handoff: {
      intent: "ai_prompt",
      prompt:
        "Let's recap the stream so far. Which parts should we focus on—big plays, jokes, strategy, or announcements?",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "live_stream_recap", prefillOnly: true },
      },
    },
  },
  {
    id: "live_crowd_poll",
    surface: "live",
    label: "Crowd Poll",
    handoff: {
      intent: "ai_prompt",
      prompt:
        "Let's run a quick crowd poll. What's the question, and what are a few options viewers should be able to choose?",
      options: {
        composeMode: "poll",
        prefer: "poll",
        extras: { replyMode: "chat", chipId: "live_crowd_poll", prefillOnly: true },
      },
    },
  },
  {
    id: "live_suggest_next_topic",
    surface: "live",
    label: "Suggest Next Topic",
    handoff: {
      intent: "ai_prompt",
      prompt:
        "Let's pick the next topic. What kind of moment do you want next—gameplay, Q&A, tutorials, or behind-the-scenes?",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "live_suggest_next_topic", prefillOnly: true },
      },
    },
  },
  {
    id: "live_shoutout_request",
    surface: "live",
    label: "Shoutout Request",
    handoff: {
      intent: "ai_prompt",
      prompt:
        "Let's request a shoutout on stream. Who should get it, and what did they do?",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "live_shoutout_request", prefillOnly: true },
      },
    },
  },
];

export const STUDIO_COMPOSER_CHIPS: PrompterChipOption[] = [
  {
    id: "studio_chat_icebreaker",
    surface: "studio",
    label: "Chat Icebreaker",
    handoff: {
      intent: "ai_prompt",
      prompt:
        "Let's spark chat with an icebreaker. What's the mood—chill or hype—and what should it be about?",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "studio_chat_icebreaker", prefillOnly: true },
      },
    },
  },
  {
    id: "studio_hype_moment",
    surface: "studio",
    label: "Hype Moment Prompt",
    handoff: {
      intent: "ai_prompt",
      prompt:
        "Let's craft a hype line for big moments. What game are you playing, and what kinds of plays should it react to?",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "studio_hype_moment", prefillOnly: true },
      },
    },
  },
  {
    id: "studio_clip_marker",
    surface: "studio",
    label: "Clip Marker",
    handoff: {
      intent: "ai_prompt",
      prompt:
        "Let's mark this moment for clipping. What just happened, and how would you like to label it?",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "studio_clip_marker", prefillOnly: true },
      },
    },
  },
  {
    id: "studio_auto_shoutouts",
    surface: "studio",
    label: "Auto Shoutouts",
    handoff: {
      intent: "ai_prompt",
      prompt:
        "Let's generate some shoutout lines. Who should get shoutouts—raiders, mods, regulars—and what should they be thanked for?",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "studio_auto_shoutouts", prefillOnly: true },
      },
    },
  },
  {
    id: "studio_chat_poll",
    surface: "studio",
    label: "Chat Poll",
    handoff: {
      intent: "ai_prompt",
      prompt:
        "Let's set up a quick chat poll. What's the question, and what are a few options people should see?",
      options: {
        composeMode: "poll",
        prefer: "poll",
        extras: { replyMode: "chat", chipId: "studio_chat_poll", prefillOnly: true },
      },
    },
  },
  {
    id: "studio_segment_timer",
    surface: "studio",
    label: "Segment Timer + Reminder",
    handoff: {
      intent: "ai_prompt",
      prompt:
        "Let's time your next segments. What segments are coming up, and how long should each run before you get a reminder?",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "studio_segment_timer", prefillOnly: true },
      },
    },
  },
];

export const MARKET_COMPOSER_CHIPS: PrompterChipOption[] = [
  {
    id: "market_featured_picks",
    surface: "market",
    label: "Featured Picks",
    handoff: {
      intent: "ai_prompt",
      prompt:
        "Let's look for featured picks in the market. What themes or categories are you most interested in—merch, overlays, coaching, or other digital goods?",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "market_featured_picks", prefillOnly: true },
      },
    },
  },
  {
    id: "market_creator_collabs",
    surface: "market",
    label: "Creator Collabs",
    handoff: {
      intent: "ai_prompt",
      prompt:
        "Let's find creator collab ideas. What kinds of creators or audiences would you like to partner with?",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "market_creator_collabs", prefillOnly: true },
      },
    },
  },
  {
    id: "market_gift_finder",
    surface: "market",
    label: "Gift Finder",
    handoff: {
      intent: "ai_prompt",
      prompt:
        "Let's find a gift. Who is it for, and what vibes or interests does this person have?",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "market_gift_finder", prefillOnly: true },
      },
    },
  },
  {
    id: "market_deal_hunter",
    surface: "market",
    label: "Deal Hunter",
    handoff: {
      intent: "ai_prompt",
      prompt:
        "Let's hunt for deals. What's your budget, and what types of products are you looking for?",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "market_deal_hunter", prefillOnly: true },
      },
    },
  },
  {
    id: "market_bundle_builder",
    surface: "market",
    label: "Bundle Builder",
    handoff: {
      intent: "ai_prompt",
      prompt:
        "Let's build a bundle across capsules. What's the use case—new streamer kit, community perks, art pack—and what's your rough budget?",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "market_bundle_builder", prefillOnly: true },
      },
    },
  },
  {
    id: "market_store_spotlight",
    surface: "market",
    label: "Store Spotlight",
    handoff: {
      intent: "ai_prompt",
      prompt:
        "Let's spotlight a capsule store. What genres, aesthetics, or creator styles are you most drawn to?",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "market_store_spotlight", prefillOnly: true },
      },
    },
  },
];

