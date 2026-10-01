'use client';

import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot, addDoc, Timestamp, updateDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuthStore } from '@/store';
import { useAuthContext } from '@/hooks';
import { LoadingSpinner } from '@/components';
import { Send } from 'lucide-react';
import toast from 'react-hot-toast';
import type { Message } from '@/types';

interface ConversationUser {
  id: string;
  displayName: string;
  photoURL: string | null;
}

export default function Messages() {
  const { user, loading: authLoading } = useAuthStore();
  useAuthContext();
  const [conversations, setConversations] = useState<ConversationUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageText, setMessageText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!user?.id) return;

    // Fetch conversations
    const q = query(
      collection(db, 'messages'),
      where('senderId', '==', user.id)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const userIds = new Set<string>();
      snapshot.forEach((doc) => {
        userIds.add(doc.data().recipientId);
      });
      setConversations(Array.from(userIds).map((id) => ({
        id,
        displayName: 'User',
        photoURL: null,
      })));
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !selectedUserId) return;

    const q = query(
      collection(db, 'messages'),
      where('senderId', '==', user.id),
      where('recipientId', '==', selectedUserId),
      orderBy('createdAt', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const messagesList: Message[] = [];
      snapshot.forEach((doc) => {
        messagesList.push({
          ...doc.data(),
          id: doc.id,
          createdAt: doc.data().createdAt?.toDate(),
        } as Message);
      });
      setMessages(messagesList);
    });

    return () => unsubscribe();
  }, [user?.id, selectedUserId]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim() || !selectedUserId || !user?.id) return;

    setSending(true);
    try {
      await addDoc(collection(db, 'messages'), {
        senderId: user.id,
        recipientId: selectedUserId,
        text: messageText,
        createdAt: Timestamp.now(),
        read: false,
      });
      setMessageText('');
      toast.success('Message sent!');
    } catch (error: any) {
      toast.error('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (!user) {
    return <div className="text-center py-12">Please sign in to view messages</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-96 md:h-full">
        {/* Conversations List */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-200">
            <h2 className="font-bold text-lg">Messages</h2>
          </div>
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <LoadingSpinner />
            </div>
          ) : conversations.length === 0 ? (
            <div className="p-4 text-center text-gray-500">No conversations yet</div>
          ) : (
            <div className="overflow-y-auto">
              {conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => setSelectedUserId(conv.id)}
                  className={`w-full p-4 border-b border-gray-100 text-left hover:bg-gray-50 transition ${
                    selectedUserId === conv.id ? 'bg-blue-50 border-l-4 border-l-blue-600' : ''
                  }`}
                >
                  <p className="font-semibold text-sm">{conv.displayName}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Chat Area */}
        <div className="md:col-span-2 bg-white rounded-lg border border-gray-200 overflow-hidden flex flex-col">
          {selectedUserId ? (
            <>
              <div className="p-4 border-b border-gray-200">
                <p className="font-semibold">Conversation</p>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.senderId === user.id ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-xs px-4 py-2 rounded-lg ${
                        msg.senderId === user.id
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-900'
                      }`}
                    >
                      <p className="text-sm">{msg.text}</p>
                      <p className="text-xs opacity-70 mt-1">
                        {msg.createdAt.toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <form onSubmit={handleSendMessage} className="p-4 border-t border-gray-200 flex gap-2">
                <input
                  type="text"
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="submit"
                  disabled={sending || !messageText.trim()}
                  className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                >
                  <Send size={20} />
                </button>
              </form>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              <p>Select a conversation to start messaging</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
