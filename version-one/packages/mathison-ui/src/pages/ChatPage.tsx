import { useState, useEffect, useRef } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import { apiClient } from '../lib/api-client';
import type { ChatMessage, WSMessage } from '../types/api';
import './ChatPage.css';

function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamBuffer, setStreamBuffer] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { isConnected } = useWebSocket({
    onMessage: (msg: WSMessage) => {
      switch (msg.type) {
        case 'stream_start':
          setIsStreaming(true);
          setStreamBuffer('');
          break;

        case 'stream_chunk':
          setStreamBuffer((prev) => prev + msg.content);
          break;

        case 'stream_end':
          setIsStreaming(false);
          setStreamBuffer('');
          setMessages((prev) => [...prev, msg.message]);
          break;

        case 'intent_proposed':
          console.log('[INTENT] Proposed:', msg);
          break;

        case 'intent_approved':
          console.log('[INTENT] Approved:', msg);
          break;

        case 'intent_denied':
          console.log('[INTENT] Denied:', msg.reason_code, msg.human_message);
          break;

        case 'error':
          console.error('[WS ERROR]', msg.error);
          break;
      }
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamBuffer]);

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');

    try {
      await apiClient.sendMessage(userMessage.content);
    } catch (e: any) {
      console.error('[CHAT ERROR]', e);
      const errorMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'system',
        content: `Error: ${e.message}`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="chat-page">
      <div className="chat-header">
        <h2>Chat</h2>
        <div className="connection-status">
          <div className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`} />
          {isConnected ? 'Connected' : 'Disconnected'}
        </div>
      </div>

      <div className="messages">
        {messages.map((msg) => (
          <div key={msg.id} className={`message ${msg.role}`}>
            <div className="message-role">{msg.role}</div>
            <div className="message-content">{msg.content}</div>
            {msg.metadata && (
              <div className="message-metadata">
                {msg.metadata.intents_proposed && (
                  <span className="metadata-item">
                    {msg.metadata.intents_proposed} intent(s)
                  </span>
                )}
                {msg.metadata.intents_approved && (
                  <span className="metadata-item success">
                    {msg.metadata.intents_approved} approved
                  </span>
                )}
                {msg.metadata.intents_denied && (
                  <span className="metadata-item danger">
                    {msg.metadata.intents_denied} denied
                  </span>
                )}
              </div>
            )}
          </div>
        ))}

        {isStreaming && streamBuffer && (
          <div className="message assistant streaming">
            <div className="message-role">assistant</div>
            <div className="message-content">{streamBuffer}</div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-container">
        <textarea
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Send a message..."
          disabled={isStreaming}
          rows={3}
        />
        <button
          className="send-button"
          onClick={handleSend}
          disabled={!input.trim() || isStreaming}
        >
          {isStreaming ? 'Sending...' : 'Send'}
        </button>
      </div>
    </div>
  );
}

export default ChatPage;
