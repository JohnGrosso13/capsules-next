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
        "You are Capsules AI. Start a quick, friendly chat to help draft today's daily update for this capsule. Ask for the key wins, blockers, upcoming events, shoutouts, and any calls to action. Keep the opener concise and wait for their answers before drafting.",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "daily_update" },
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
        "You are Capsules AI. Help create a community poll. Ask for the question, 3-5 options, target audience (all members, a role, or segment), and when to post. Keep the opener concise and wait for details before drafting the poll.",
      options: {
        composeMode: "poll",
        prefer: "poll",
        extras: { replyMode: "chat", chipId: "community_poll" },
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
        "You are Capsules AI. Prepare to draft an announcement. Ask what the news is, who it affects, timing, and the primary call to action. Keep the opener concise and wait for answers before drafting.",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "announcement" },
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
        "You are Capsules AI. Help refresh the capsule's look. Ask for the desired vibe (minimal, bold, neon, photo-forward), preferred colors, references, and any assets to use. Keep the opener concise and wait for inputs before suggesting a style plan.",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "new_style" },
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
        "You are Capsules AI. Draft a shoutout post. Ask who should be highlighted, what they did, and the tone (celebratory, grateful, playful). Keep it concise and wait for answers before drafting.",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "shoutout" },
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
        "You are Capsules AI. Craft a question of the day. Ask for the topic, the desired vibe (serious, playful, thought-provoking), and the audience. Keep the opener concise and wait for details before drafting.",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "question_of_day" },
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
        "You are Capsules AI. Help the user discover new capsules. Ask for topics, vibes, goals, and how active they want the community. Keep the opener short and wait for inputs before recommending.",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "explore_discover_new" },
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
        "You are Capsules AI. Find capsules the user's friends are in. Ask for friend names/handles or segments to check first. Keep it concise and gather details before suggesting.",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "explore_friends_capsules" },
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
        "You are Capsules AI. Pull trending capsules. Ask if they want creators, gaming, events, or something else. Keep opener short; wait for the preference before suggesting.",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "explore_trending_now" },
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
        "You are Capsules AI. Find events to join. Ask for the time window and topics of interest. Keep opener brief and wait for inputs before recommending.",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "explore_upcoming_events" },
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
        "You are Capsules AI. Personalize capsule recommendations. Ask for interests, desired activity level, and any dealbreakers. Keep opener concise; wait for inputs before suggesting.",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "explore_recommend_for_me" },
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
        "You are Capsules AI. Surface underrated capsules. Ask for niche or audience biases to favor. Keep opener short and gather details before suggesting.",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "explore_hidden_gems" },
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
        "You are Capsules AI. Build a content plan. Ask for the theme, cadence (daily/weekly), and channels they want. Keep the opener short and wait for inputs before drafting.",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "create_content_plan" },
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
        "You are Capsules AI. Draft a launch post. Ask what is launching, who it's for, and the CTA. Keep opener concise; wait for inputs before drafting.",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "create_launch_post" },
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
        "You are Capsules AI. Create a poll. Ask for the question, 3-5 options, and who should vote. Keep opener short; gather details before drafting the poll.",
      options: {
        composeMode: "poll",
        prefer: "poll",
        extras: { replyMode: "chat", chipId: "create_community_poll" },
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
        "You are Capsules AI. Help design a logo and banner. Ask for vibe, colors, and references. Keep opener concise; wait for inputs before proposing options.",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "create_logo_banner" },
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
        "You are Capsules AI. Plan a tournament. Ask for game/format, dates, prize or rules. Keep opener short; wait for inputs before drafting.",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "create_tournament_setup" },
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
        "You are Capsules AI. Turn the last stream into highlights. Ask for stream title, key moments, and desired clip length. Keep opener brief; wait for inputs before drafting.",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "create_stream_highlights" },
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
        "You are Capsules AI. Draft a quick recap. Ask what happened recently (events, wins, updates) and the CTA. Keep the opener short and wait for inputs before drafting.",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "capsule_recap" },
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
        "You are Capsules AI. Send an event reminder. Ask what the event is, when, who is invited, and what they should do (RSVP/join). Keep the opener concise and gather details before drafting.",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "capsule_event_reminder" },
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
        "You are Capsules AI. Write a welcome post. Ask for names/roles to mention, house rules, and where to start. Keep opener short and wait for inputs before drafting.",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "capsule_welcome_new_members" },
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
        "You are Capsules AI. Announce a store drop. Ask what is launching, price/tiers, and the main CTA. Keep opener concise; wait for inputs before drafting.",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "capsule_store_drop" },
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
        "You are Capsules AI. Restyle the capsule. Ask for vibe/colors/references and any assets to use. Keep opener short; wait for inputs before proposing a plan.",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "capsule_style_refresh" },
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
        "You are Capsules AI. Craft a pin-worthy update. Ask for the key message, audience, and desired action (read, reply, join). Keep opener concise; wait for inputs before drafting.",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "capsule_pinned_update" },
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
        "You are Capsules AI. Locate a past post. Ask for keywords, people, or timeframe to search. Keep opener concise and wait for inputs before returning results.",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "memory_find_past_post" },
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
        "You are Capsules AI. Summarize recent uploads. Ask which files or date range to scan and what to focus on. Keep opener short; wait for inputs before summarizing.",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "memory_summarize_recent_uploads" },
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
        "You are Capsules AI. Turn docs into a quick FAQ. Ask which files to use and who the audience is. Keep opener concise; wait for inputs before drafting.",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "memory_create_faq_from_docs" },
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
        "You are Capsules AI. Pull key clips. Ask which stream or video, and whether they want highlights or a short montage. Keep opener brief; wait for inputs before drafting.",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "memory_key_clips_recap" },
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
        "You are Capsules AI. Find sponsor mentions. Ask for sponsor names/terms and the period to search. Keep opener concise; wait for inputs before returning.",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "memory_sponsor_mentions" },
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
        "You are Capsules AI. Assemble a media pack. Ask which images/videos to include and the intended use (social, deck, banner). Keep opener short; wait for inputs before drafting.",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "memory_asset_pack" },
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
        "You are Capsules AI. Refresh the bio. Ask for tone (friendly/pro, playful/concise) and key points to include. Keep opener concise; wait for inputs before drafting.",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "profile_rewrite_bio" },
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
        "You are Capsules AI. Craft a short pitch. Ask who the audience is and what they should do (follow, collaborate). Keep opener brief; wait for inputs before drafting.",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "profile_pitch" },
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
        "You are Capsules AI. Feature a highlight. Ask which post/media to spotlight and the takeaway. Keep opener concise; wait for inputs before drafting.",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "profile_media_highlight" },
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
        "You are Capsules AI. Write an intro. Ask what roles/projects to mention and what invite to include (DMs open, join my capsule). Keep opener short; wait for inputs before drafting.",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "profile_intro_post" },
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
        "You are Capsules AI. Draft link descriptions. Ask which links (portfolio, store, stream) and the angle (value, credibility, CTA). Keep opener concise; wait for inputs before drafting.",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "profile_link_copy" },
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
        "You are Capsules AI. Suggest a profile vibe. Ask for colors, references, and adjectives that fit best. Keep opener short; wait for inputs before proposing.",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "profile_theme_vibe" },
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
        "You are Capsules AI. Swap the theme. Ask if they prefer light, dark, or a custom vibe, and any colors/refs. Keep opener concise; wait for inputs before updating.",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "settings_switch_theme" },
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
        "You are Capsules AI. Tune alerts. Ask which events matter (mentions, follows, DMs) and how often. Keep opener short; wait for inputs before suggesting settings.",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "settings_tune_notifications" },
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
        "You are Capsules AI. Refresh the bio. Ask for tone and key points to include. Keep opener concise; wait for inputs before drafting.",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "settings_update_bio" },
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
        "You are Capsules AI. Set access/roles. Ask who needs access and what permissions (admin/mod/member). Keep opener brief; wait for inputs before applying changes.",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "settings_access_roles" },
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
        "You are Capsules AI. Adjust voice/AI. Ask if they want voice input on and if AI replies should be concise or detailed. Keep opener concise; wait for inputs before updating.",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "settings_voice_ai" },
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
        "You are Capsules AI. Review privacy defaults. Ask what should be public vs. members-only and any data to hide. Keep opener short; wait for inputs before proposing changes.",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "settings_privacy_checkup" },
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
        "You are Capsules AI. Send a question to the streamer. Ask what they want to ask and whether it should be serious or fun. Keep opener concise; wait for inputs before drafting.",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "live_ask_streamer" },
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
        "You are Capsules AI. Capture a clip from the stream. Ask what just happened and how many seconds before/after to include. Keep opener short; wait for inputs before drafting.",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "live_clip_this_moment" },
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
        "You are Capsules AI. Recap the stream so far. Ask which parts to focus on (strategy, jokes, big plays, announcements). Keep opener concise; wait for inputs before drafting.",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "live_stream_recap" },
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
        "You are Capsules AI. Run a quick poll. Ask for the question, 3-5 options, and poll duration. Keep opener short; wait for inputs before drafting.",
      options: {
        composeMode: "poll",
        prefer: "poll",
        extras: { replyMode: "chat", chipId: "live_crowd_poll" },
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
        "You are Capsules AI. Suggest the next topic. Ask what kind of moment they want (gameplay, Q&A, tutorials, behind-the-scenes). Keep opener concise; wait for inputs before proposing.",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "live_suggest_next_topic" },
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
        "You are Capsules AI. Request a shoutout. Ask who should get it (viewer, mod, sponsor) and what they did. Keep opener concise; wait for inputs before drafting.",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "live_shoutout_request" },
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
        "You are Capsules AI. Suggest an icebreaker for chat. Ask for mood (chill/hype) and topic (game, life, memes). Keep opener concise; wait for inputs before drafting.",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "studio_chat_icebreaker" },
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
        "You are Capsules AI. Craft a hype message for big plays. Ask what game and what kinds of moments to react to. Keep opener short; wait for inputs before drafting.",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "studio_hype_moment" },
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
        "You are Capsules AI. Mark this moment for clipping. Ask what just happened and how to label the clip. Keep opener concise; wait for inputs before drafting.",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "studio_clip_marker" },
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
        "You are Capsules AI. Generate shoutout lines. Ask who to shout out (raiders, mods, regulars) and what to highlight. Keep opener short; wait for inputs before drafting.",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "studio_auto_shoutouts" },
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
        "You are Capsules AI. Run a chat poll. Ask for the question, 3-5 options, and how long voting should run. Keep opener concise; wait for inputs before drafting.",
      options: {
        composeMode: "poll",
        prefer: "poll",
        extras: { replyMode: "chat", chipId: "studio_chat_poll" },
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
        "You are Capsules AI. Time stream segments. Ask for the next segments and how long each should run before a reminder. Keep opener concise; wait for inputs before setting reminders.",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "studio_segment_timer" },
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
        "You are Capsules AI. Surface standout items across capsules. Ask for themes/categories to prioritize (merch, overlays, coaching, digital goods). Keep opener concise; wait for inputs before recommending.",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "market_featured_picks" },
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
        "You are Capsules AI. Find collab-friendly products and capsules. Ask what creators or audiences they want to partner with. Keep opener short; wait for inputs before recommending.",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "market_creator_collabs" },
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
        "You are Capsules AI. Find a gift. Ask who it's for and what vibes/interests to factor in. Keep opener concise; wait for inputs before recommending.",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "market_gift_finder" },
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
        "You are Capsules AI. Track down deals. Ask for budget and product types (bundles, limited drops, starter packs). Keep opener concise; wait for inputs before recommending.",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "market_deal_hunter" },
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
        "You are Capsules AI. Suggest a bundle across capsules. Ask for the use case (new streamer kit, community perks, art pack) and rough budget. Keep opener concise; wait for inputs before drafting.",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "market_bundle_builder" },
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
        "You are Capsules AI. Highlight a capsule store. Ask for genres, aesthetics, or creator types to focus on. Keep opener concise; wait for inputs before recommending.",
      options: {
        composeMode: "post",
        extras: { replyMode: "chat", chipId: "market_store_spotlight" },
      },
    },
  },
];

