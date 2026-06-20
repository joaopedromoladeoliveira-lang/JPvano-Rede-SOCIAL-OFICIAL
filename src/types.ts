export interface UserProfile {
  uid: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  role: 'superadmin' | 'admin' | 'moderator' | 'verified' | 'user';
  avatar: string; // Emoji or Initials
  bio: string;
  website?: string; // Link na bio
  followersCount: number;
  followingCount: number;
  postsCount: number;
  birthdate: string;
  status: 'ativo' | 'banido';
  createdAt: any;
  isVerified?: boolean;
}

export interface PostComment {
  id: string;
  username: string;
  text: string;
  createdAt: number;
}

export interface Post {
  id: string;
  userId: string;
  username: string;
  name: string;
  emoji: string;
  likes: string[]; // uids of users who liked
  caption: string;
  comments: PostComment[];
  commentsCount: number;
  timeLabel: string;
  createdAt: number;
  isFeatured?: boolean;
  mediaUrl?: string; // base64 or URL
  mediaType?: 'image' | 'video' | 'emoji';
  musicUrl?: string;
  musicTitle?: string;
  filter?: string; // e.g. grayscale, sepia, vintage, saturate, etc.
  brightness?: number;
  contrast?: number;
  saturation?: number;
  rotation?: number;
  zoom?: number;
  textOverlay?: string;
  overlayColor?: string;
  overlaySize?: string;
}

export interface Story {
  id: string;
  userId: string;
  username: string;
  emoji: string;
  seenBy: string[]; // list of uids
  createdAt: number;
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'emoji';
  musicUrl?: string;
  musicTitle?: string;
  filter?: string;
  brightness?: number;
  contrast?: number;
  saturation?: number;
  rotation?: number;
  zoom?: number;
  textOverlay?: string;
  overlayColor?: string;
  overlaySize?: string;
}

export interface Reel {
  id: string;
  userId: string;
  username: string;
  emoji: string;
  caption: string;
  likes: string[]; // list of uids who liked
  comments: PostComment[];
  commentsCount: number;
  createdAt: number;
  mediaUrl?: string;
  mediaType?: 'image' | 'video';
  musicUrl?: string;
  musicTitle?: string;
  filter?: string;
  brightness?: number;
  contrast?: number;
  saturation?: number;
  rotation?: number;
  zoom?: number;
  textOverlay?: string;
  overlayColor?: string;
  overlaySize?: string;
}

export interface Song {
  id: string;
  title: string;
  artist: string;
  url: string; // Base64 data URL
  createdAt: number;
}

export interface Suggestion {
  id: string;
  user: string;
  name: string;
  emoji: string;
  reason: string;
}

export interface ReportItem {
  id: string;
  targetId: string;
  title: string;
  subtitle: string;
  type: 'Ódio' | 'Falso' | 'Spam';
  status: 'pendente' | 'resolvido';
  count: number;
}

export interface ActivityLog {
  id: string;
  text: string;
  author: string;
  timeLabel: string;
  status: 'success' | 'danger' | 'info' | 'warning';
  createdAt: number;
}

export interface DirectMessage {
  id: string;
  senderId: string;
  senderName: string;
  receiverId: string;
  receiverName: string;
  text?: string;
  audioUrl?: string; // Voice notes as Base64 data URLs
  duration?: number; // duration of video/audio note in seconds
  createdAt: number;
  read?: boolean;
}

export interface Call {
  id: string;
  callerId: string;
  callerName: string;
  callerAvatar?: string;
  receiverId: string;
  receiverName: string;
  receiverAvatar?: string;
  status: 'calling' | 'accepted' | 'missed' | 'ended' | 'rejected';
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
  type: 'voice' | 'video';
  // WebRTC signaling payloads
  offer?: string; // serialized RTCSessionDescriptionInit JSON string
  answer?: string; // serialized RTCSessionDescriptionInit JSON string
  callerCandidates?: string; // JSON string list of RTCIceCandidateInit
  receiverCandidates?: string; // JSON string list of RTCIceCandidateInit
}

export interface UserSettings {
  userId: string;
  ringtoneUrl?: string; // Base64 data URL representing personal tone
  notificationSound?: boolean;
  status?: 'online' | 'offline';
  lastSeen?: number;
}

