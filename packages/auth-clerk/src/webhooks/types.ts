export type {
  WebhookEvent as ClerkSdkWebhookEvent,
  WebhookEventType as ClerkSdkWebhookEventType,
} from '@clerk/backend';

export interface ClerkWebhookEvent<T = Record<string, unknown>> {
  type: string;
  data: T;
  object: 'event';
}

export interface ClerkUserData {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email_addresses: Array<{
    id: string;
    email_address: string;
    verification: { status: string } | null;
  }>;
  primary_email_address_id: string | null;
  phone_numbers: Array<{
    id: string;
    phone_number: string;
    verification: { status: string } | null;
  }>;
  primary_phone_number_id: string | null;
  image_url: string;
  username: string | null;
  external_id: string | null;
  public_metadata: Record<string, unknown>;
  private_metadata: Record<string, unknown>;
  unsafe_metadata: Record<string, unknown>;
  created_at: number;
  updated_at: number;
}

export interface ClerkSessionData {
  id: string;
  user_id: string;
  client_id: string;
  status: string;
  last_active_at: number;
  expire_at: number;
  abandon_at: number;
  created_at: number;
  updated_at: number;
}

export interface ClerkOrganizationData {
  id: string;
  name: string;
  slug: string;
  image_url: string;
  max_allowed_memberships: number;
  public_metadata: Record<string, unknown>;
  private_metadata: Record<string, unknown>;
  created_at: number;
  updated_at: number;
}

export interface ClerkOrganizationMembershipData {
  id: string;
  organization: { id: string; name: string; slug: string };
  public_user_data: {
    user_id: string;
    first_name: string | null;
    last_name: string | null;
    image_url: string;
  };
  role: string;
  created_at: number;
  updated_at: number;
}

export type ClerkUserEventType =
  | 'user.created'
  | 'user.updated'
  | 'user.deleted';

export type ClerkSessionEventType =
  | 'session.created'
  | 'session.ended'
  | 'session.removed'
  | 'session.revoked';

export type ClerkOrganizationEventType =
  | 'organization.created'
  | 'organization.updated'
  | 'organization.deleted';

export type ClerkOrganizationMembershipEventType =
  | 'organizationMembership.created'
  | 'organizationMembership.updated'
  | 'organizationMembership.deleted';

export type ClerkEmailEventType = 'email.created';

export type ClerkEventType =
  | ClerkUserEventType
  | ClerkSessionEventType
  | ClerkOrganizationEventType
  | ClerkOrganizationMembershipEventType
  | ClerkEmailEventType;

export const CLERK_EVENT_TYPES: readonly ClerkEventType[] = [
  'user.created',
  'user.updated',
  'user.deleted',
  'session.created',
  'session.ended',
  'session.removed',
  'session.revoked',
  'organization.created',
  'organization.updated',
  'organization.deleted',
  'organizationMembership.created',
  'organizationMembership.updated',
  'organizationMembership.deleted',
  'email.created',
] as const;
