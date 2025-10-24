-- Development helper: clears chat data (direct + group).
truncate table
  public.chat_group_message_reactions,
  public.chat_group_messages,
  public.chat_group_participants,
  public.chat_group_conversations,
  public.chat_message_reactions,
  public.chat_messages
restart identity cascade;
