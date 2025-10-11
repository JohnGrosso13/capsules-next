import { z } from "zod";

const memberProfileSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  userKey: z.string().nullable(),
});

export const capsuleMemberSchema = z.object({
  userId: z.string(),
  role: z.string().nullable(),
  joinedAt: z.string().nullable(),
  name: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  userKey: z.string().nullable(),
  isOwner: z.boolean(),
});

export const capsuleMemberRequestSchema = z.object({
  id: z.string(),
  capsuleId: z.string(),
  requesterId: z.string(),
  responderId: z.string().nullable(),
  status: z.union([
    z.literal("pending"),
    z.literal("approved"),
    z.literal("declined"),
    z.literal("cancelled"),
  ]),
  role: z.string().nullable(),
  message: z.string().nullable(),
  createdAt: z.string().nullable(),
  respondedAt: z.string().nullable(),
  approvedAt: z.string().nullable(),
  declinedAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  requester: memberProfileSchema.nullable(),
});

export const capsuleMembershipViewerSchema = z.object({
  userId: z.string().nullable(),
  isOwner: z.boolean(),
  isMember: z.boolean(),
  canManage: z.boolean(),
  canRequest: z.boolean(),
  role: z.string().nullable(),
  memberSince: z.string().nullable(),
  requestStatus: z.union([
    z.literal("pending"),
    z.literal("approved"),
    z.literal("declined"),
    z.literal("cancelled"),
    z.literal("none"),
  ]),
  requestId: z.string().nullable(),
});

export const capsuleMembershipStateSchema = z.object({
  capsule: z.object({
    id: z.string(),
    name: z.string().nullable(),
    slug: z.string().nullable(),
    ownerId: z.string(),
    bannerUrl: z.string().nullable(),
    storeBannerUrl: z.string().nullable(),
    promoTileUrl: z.string().nullable(),
    logoUrl: z.string().nullable(),
  }),
  viewer: capsuleMembershipViewerSchema,
  counts: z.object({
    members: z.number().int().nonnegative(),
    pendingRequests: z.number().int().nonnegative(),
  }),
  members: z.array(capsuleMemberSchema),
  requests: z.array(capsuleMemberRequestSchema),
  viewerRequest: capsuleMemberRequestSchema.nullable(),
});

const capsuleMemberRoleSchema = z.enum(["member", "leader", "admin", "founder"]);

export const capsuleMembershipActionSchema = z
  .object({
    action: z.enum(["request_join", "approve_request", "decline_request", "remove_member", "set_role"]),
    message: z.string().trim().max(500).optional(),
    requestId: z.string().uuid("requestId must be a valid UUID").optional(),
    memberId: z.string().uuid("memberId must be a valid UUID").optional(),
    role: capsuleMemberRoleSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.action === "set_role") {
      if (!value.memberId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "memberId is required to set a role.",
          path: ["memberId"],
        });
      }
      if (!value.role) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "role is required when setting a role.",
          path: ["role"],
        });
      }
    }
  });

export const capsuleMembershipResponseSchema = z.object({
  membership: capsuleMembershipStateSchema,
});
