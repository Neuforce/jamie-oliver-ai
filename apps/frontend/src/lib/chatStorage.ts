import { clearChatSession } from './api';

export const CHAT_STORAGE_KEY = 'jamie-oliver-chat-messages';
export const SESSION_ID_KEY = 'jamie-oliver-chat-session';

export const clearChatHistory = async () => {
  try {
    localStorage.removeItem(CHAT_STORAGE_KEY);
    const sessionId = localStorage.getItem(SESSION_ID_KEY);
    if (sessionId) {
      try {
        await clearChatSession(sessionId);
      } catch (e) {
        console.warn('Failed to clear backend session:', e);
      }
      localStorage.removeItem(SESSION_ID_KEY);
    }
  } catch (error) {
    console.error('Error clearing chat history:', error);
  }
};
