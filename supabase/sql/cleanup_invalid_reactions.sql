-- Remove clearly invalid/corrupted reaction entries produced when the
-- quick-reaction emoji set was accidentally committed as "??" strings.
-- Safe to run multiple times.

delete from public.chat_message_reactions where emoji in ('??', '?');
delete from public.chat_group_message_reactions where emoji in ('??', '?');

-- Optionally, drop any reactions that don't contain likely emoji codepoints.
-- This heuristic targets BMP symbols + modern emoji ranges.
delete from public.chat_message_reactions
where emoji !~ '[\x{2600}-\x{27BF}]|[\x{1F000}-\x{1FAFF}]';

delete from public.chat_group_message_reactions
where emoji !~ '[\x{2600}-\x{27BF}]|[\x{1F000}-\x{1FAFF}]';

