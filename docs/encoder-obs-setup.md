# External Encoder & OBS Setup

This guide explains how to configure the refreshed **External Encoder** tab in Live Studio and run an OBS broadcast end-to-end. The new card-grid layout aligns with capsule theming, surfaces health telemetry, and shares notifications across Studio, Producer Console, and Clips.

## 1. Provision RTMP credentials

1. Select a capsule on the **Live Studio** tab. A banner will prompt you to visit **External Encoder** if streaming is not provisioned.
2. Choose a latency profile (Ultra-low, Reduced, or Standard) and click **Create live stream**.  
   - The credentials card immediately renders primary/backup ingest URLs and stream keys.  
   - Use the `Copy` buttons to place values on the clipboard; `Reveal` toggles expose masked keys when needed.  
   - Rotate keys at any time with **Rotate stream key**—cross-tab badges warn when Mux rejects a key.

## 2. Configure OBS or hardware encoder

1. Click **Download OBS profile** to import pre-populated ingest settings into OBS.  
2. Use **Open preview** to validate playback, and copy the embed snippet for downstream publishing.  
3. The **Mobile ingest QR** card generates a scannable payload so field teams can pair mobile encoders quickly.

## 3. Manage simulcast destinations

1. Add Twitch, YouTube, Kick, Facebook, or custom RTMP targets via **Add destination**.  
2. Guardrails ensure custom destinations include an ingest URL before enabling.  
3. Status chips mirror Mux health:
   - _Live/Connected_ shows healthy sync.
   - _Error_ highlights destinations that failed; nav badges and Studio banners prompt action.

## 4. Automate with webhooks

1. Configure labelled endpoints, optional secrets, and subscribed events (stream started/ended, asset ready/errored).  
2. Use **Send test** to fire the new webhook test stub—results persist for 2.5 seconds in the status chip.  
3. Enable/disable without removing, or remove completely when decommissioning an endpoint.

## 5. Stream preferences & persistence

- Disconnect protection, audio warnings, VOD archival, autopublish, and auto clips save instantly via the preferences card.  
- All settings sync with Supabase and reflect across tabs; manual refresh is available on every notification banner.

## 6. Cross-tab notifications & badges

- `StudioNotificationBanner` surfaces encoder alerts across Live Studio, Producer Console, and Clips.  
- nav badges communicate live status, simulcast issues, or key rotation prompts without leaving the current tab.  
- `Refresh` action on banners calls the shared `refreshOverview` flow, honouring Supabase schedule timers.

## 7. Recommended OBS checklist

1. Import the downloaded profile; verify ingest URL and key match the newly provisioned values.  
2. Start the stream—Studio banners shift to **Live heartbeat** within a few seconds if Mux receives signal.  
3. Confirm simulcast status chips transition to **Live** (or troubleshoot via the red notification badge).  
4. Validate the preview player, clipboard embed, and webhook delivery test before announcing go-live.

Following these steps ensures producers notice encoder health regressions immediately, and collaborators in the Studio, Producer, and Clips views stay aligned while the stream runs.
