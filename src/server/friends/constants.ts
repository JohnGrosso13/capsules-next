export const FRIENDSHIP_SELECT =
  "id,user_id,friend_user_id,request_id,created_at,deleted_at,users:friend_user_id(id,user_key,full_name,avatar_url)";

export const FRIEND_REQUEST_SELECT =
  "id,requester_id,recipient_id,status,message,created_at,responded_at,accepted_at,deleted_at," +
  "requester:requester_id(id,user_key,full_name,avatar_url)," +
  "recipient:recipient_id(id,user_key,full_name,avatar_url)";

export const FOLLOW_EDGE_SELECT =
  "id,follower_user_id,followee_user_id,muted_at,created_at,deleted_at," +
  "follower:follower_user_id(id,user_key,full_name,avatar_url)," +
  "followee:followee_user_id(id,user_key,full_name,avatar_url)";

export const BLOCK_SELECT =
  "id,blocker_user_id,blocked_user_id,reason,expires_at,created_at,deleted_at," +
  "blocked:blocked_user_id(id,user_key,full_name,avatar_url)";

export const NO_ROW_CODE = "PGRST116";
