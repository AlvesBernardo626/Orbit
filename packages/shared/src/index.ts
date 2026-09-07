import { z } from 'zod';
export const MAX_MEMBERS = 8;
export const idSchema = z.string().regex(/^[a-f\d]{24}$/i);
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,24}$/);
export const passwordSchema = z
  .string()
  .min(12)
  .max(72)
  .refine((v) => new TextEncoder().encode(v).length <= 72, 'Senha deve ter até 72 bytes');
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine(
      (v) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v),
      'Texto contém caracteres inválidos',
    );
export const imageSchema = z.union([
  z.literal(''),
  z
    .url()
    .max(2048)
    .refine((v) => new URL(v).protocol === 'https:', 'Use uma URL HTTPS'),
]);
export const registerSchema = z
  .object({ username: usernameSchema, displayName: text(48).min(1), password: passwordSchema })
  .strict();
export const loginSchema = z
  .object({ username: usernameSchema, password: z.string().min(1).max(256) })
  .strict();
export const statusSchema = z.enum(['online', 'away', 'busy', 'offline']);
export const profileSchema = z
  .object({
    username: usernameSchema,
    displayName: text(48).min(1),
    avatar: imageSchema,
    banner: imageSchema,
    bio: text(300),
    status: statusSchema,
    customStatus: text(80),
  })
  .partial()
  .strict();
export const messageSchema = z.object({ content: text(4000).min(1), clientId: z.uuid() }).strict();
export const groupSchema = z
  .object({
    name: text(64).min(1),
    image: imageSchema.default(''),
    members: z.array(idSchema).max(MAX_MEMBERS - 1),
  })
  .strict();
export const signalSchema = z
  .object({
    to: z.string().min(1).max(80),
    description: z
      .object({ type: z.enum(['offer', 'answer']), sdp: z.string().max(64000) })
      .strict()
      .optional(),
    candidate: z
      .object({
        candidate: z.string().max(2048),
        sdpMid: z.string().max(256).nullable().optional(),
        sdpMLineIndex: z.number().int().min(0).max(64).nullable().optional(),
        usernameFragment: z.string().max(256).nullable().optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine((v) => Boolean(v.description) !== Boolean(v.candidate));
export type Status = z.infer<typeof statusSchema>;
export type Role = 'owner' | 'admin' | 'member';
export interface User {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  banner: string;
  bio: string;
  status: Status;
  customStatus: string;
}
export interface Member {
  user: User;
  role: Role;
}
export interface Conversation {
  id: string;
  kind: 'dm' | 'group';
  name: string;
  image: string;
  members: Member[];
  unread: number;
  updatedAt: string;
  groupId?: string;
}
export interface Message {
  id: string;
  conversationId: string;
  authorId: string;
  content: string;
  clientId: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  attachments: never[];
}
export interface Friend {
  id: string;
  state: 'pending' | 'accepted';
  incoming: boolean;
  user: User;
}
export interface Bootstrap {
  me: User;
  friends: Friend[];
  blocked: User[];
  conversations: Conversation[];
}
export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: User;
}
export interface Session {
  accessToken: string;
  user: User;
}
export interface CallPeer {
  socketId: string;
  userId: string;
  muted: boolean;
  sharing: boolean;
}
export type Signal = z.infer<typeof signalSchema>;
export type Ack<T = Record<string, never>> = (
  result: { ok: true; data: T } | { ok: false; error: string },
) => void;
export interface IceConfig {
  iceServers: { urls: string | string[]; username?: string; credential?: string }[];
  iceTransportPolicy: 'all' | 'relay';
}
export const canManage = (actor: Role, target: Role) =>
  actor === 'owner' ? target !== 'owner' : actor === 'admin' && target === 'member';
