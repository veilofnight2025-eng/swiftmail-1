
import { Domain, Account, AuthToken, Message, MessageDetail } from '../types';

const API_BASE = 'https://api.mail.tm';

export const mailApi = {
  async getDomains(): Promise<Domain[]> {
    const res = await fetch(`${API_BASE}/domains`);
    if (!res.ok) throw new Error('Failed to fetch domains');
    const data = await res.json();
    return data['hydra:member'];
  },

  async createAccount(address: string, password: string): Promise<Account> {
    const res = await fetch(`${API_BASE}/accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, password }),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.detail || 'Failed to create account');
    }
    return res.json();
  },

  async getToken(address: string, password: string): Promise<AuthToken> {
    const res = await fetch(`${API_BASE}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, password }),
    });
    if (!res.ok) throw new Error('Authentication failed');
    return res.json();
  },

  // Get account details by ID
  async getAccount(id: string, token: string): Promise<Account> {
    const res = await fetch(`${API_BASE}/accounts/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to fetch account details');
    return res.json();
  },

  async getMessages(token: string): Promise<Message[]> {
    const res = await fetch(`${API_BASE}/messages`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to fetch messages');
    const data = await res.json();
    return data['hydra:member'];
  },

  async getMessage(id: string, token: string): Promise<MessageDetail> {
    const res = await fetch(`${API_BASE}/messages/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to fetch message details');
    return res.json();
  },

  async deleteMessage(id: string, token: string): Promise<void> {
    const res = await fetch(`${API_BASE}/messages/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to delete message');
  },

  async deleteAccount(id: string, token: string): Promise<void> {
    const res = await fetch(`${API_BASE}/accounts/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to delete account');
  }
};
