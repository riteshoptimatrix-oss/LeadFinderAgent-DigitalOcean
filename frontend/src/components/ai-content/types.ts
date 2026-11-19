export interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
  type?: 'generate' | 'modify';
  error?: boolean;
}

export interface SessionStatus {
  success: boolean;
  status: 'ready' | 'needs_login' | 'authenticating' | 'idle' | 'error';
  is_logged_in: boolean;
  browser_running: boolean;
  message?: string;
}
