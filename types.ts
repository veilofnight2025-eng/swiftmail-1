
export interface Domain {
  id: string;
  domain: string;
  isActive: boolean;
  isPrivate: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Account {
  id: string;
  address: string;
  quota: number;
  used: number;
  isDisabled: boolean;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuthToken {
  token: string;
  id: string;
}

export interface Message {
  id: string;
  accountId: string;
  msgid: string;
  from: {
    address: string;
    name: string;
  };
  to: {
    address: string;
    name: string;
  }[];
  subject: string;
  intro: string;
  seen: boolean;
  isDeleted: boolean;
  hasAttachments: boolean;
  size: number;
  downloadUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface MessageDetail extends Message {
  text: string;
  html: string[];
}

export interface AutoPurgeSettings {
  enabled: boolean;
  durationMs: number;
}

export interface AppState {
  account: Account | null;
  token: string | null;
  password: string | null;
  messages: Message[];
  selectedMessage: MessageDetail | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  autoPurge: AutoPurgeSettings;
}
