'use client';

import { useState, useEffect, useRef } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getConversationUsername } from '@/lib/public-profile';
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

interface MessagingState {
  ownerId: string;
  conversations: ConversationUser[];
  selectedUserId: string | null;
  messages: {
    recipientId: string;
    items: Message[];
  } | null;
  messageText: string;
  loading: boolean;
}

function initialMessagingState(ownerId: string): MessagingState {
  return {
    ownerId,
    conversations: [],
    selectedUserId: null,
    messages: null,
    messageText: '',
    loading: true,
  };
}

export default function Messages() {
  const { user, loading: authLoading } = useAuthStore();
  useAuthContext();

  const [messagingState, setMessagingState] =
    useState<MessagingState | null>(null);
  const [sending, setSending] = useState(false);
  const sendingOwnerRef = useRef<string | null>(null);

  const ownerId = user?.id ?? null;
  const activeOwnerRef = useRef(ownerId);
  activeOwnerRef.current = ownerId;

  // Never expose state belonging to a different signed-in account.
  const currentState =
    ownerId && messagingState?.ownerId === ownerId
      ? messagingState
      : null;

  const selectedUserId = currentState?.selectedUserId ?? null;
  const messageText = currentState?.messageText ?? '';

  const messages =
    currentState?.messages?.recipientId === selectedUserId
      ? currentState.messages.items
      : [];

  useEffect(() => {
    sendingOwnerRef.current = null;
    setSending(false);

    if (!ownerId) {
      setMessagingState(null);
      return;
    }

    const uid = ownerId;
    let active = true;

    setMessagingState(initialMessagingState(uid));

    const q = query(
      collection(db, 'messages'),
      where('senderId', '==', uid)
    );

    const profileLookups = new Map<
      string,
      { messageId: string; deactivate: () => void }
    >();

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (!active) return;

        const userIds = new Map<string, string>();

        snapshot.forEach(messageDoc => {
          const { recipientId } = messageDoc.data();

          if (typeof recipientId === 'string' && recipientId && !userIds.has(recipientId)) {
            userIds.set(recipientId, messageDoc.id);
          }
        });

        for (const [id, lookup] of profileLookups) {
          if (!userIds.has(id) || userIds.get(id) !== lookup.messageId) {
            lookup.deactivate();
            profileLookups.delete(id);
          }
        }

        setMessagingState((previous) => {
          if (!previous || previous.ownerId !== uid) {
            return previous;
          }

          const conversations = Array.from(userIds.keys()).map(id => {
            const existing = previous.conversations.find(
              (conversation) => conversation.id === id
            );

            return (
              existing ?? {
                id,
                displayName: 'Username unavailable',
                photoURL: null,
              }
            );
          });

          const selectionStillExists =
            previous.selectedUserId !== null &&
            userIds.has(previous.selectedUserId);

          return {
            ...previous,
            conversations,
            selectedUserId: selectionStillExists
              ? previous.selectedUserId
              : null,
            messages: selectionStillExists
              ? previous.messages
              : null,
            messageText: selectionStillExists
              ? previous.messageText
              : '',
            loading: false,
          };
        });

        for (const [id, messageId] of userIds) {
          if (profileLookups.has(id)) continue;

          let listenerActive = true;

          const updateUsername = (username: string) => {
            if (!active || !listenerActive) return;

            setMessagingState((previous) => {
              if (!previous || previous.ownerId !== uid) {
                return previous;
              }

              return {
                ...previous,
                conversations: previous.conversations.map(
                  (conversation) =>
                    conversation.id === id
                      ? { ...conversation, displayName: username }
                      : conversation
                ),
              };
            });
          };

          getConversationUsername(messageId).then(username => {
            updateUsername(username ?? 'Username unavailable');
          }).catch(() => {
            updateUsername('Username unavailable');
          });

          profileLookups.set(id, {
            messageId,
            deactivate: () => {
              listenerActive = false;
            },
          });
        }
      },
      () => {
        if (!active) return;

        setMessagingState((previous) =>
          previous?.ownerId === uid
            ? { ...previous, loading: false }
            : previous
        );
      }
    );

    return () => {
      active = false;
      unsubscribe();

      for (const listener of profileLookups.values()) {
        listener.deactivate();
      }

      profileLookups.clear();
    };
  }, [ownerId]);

  useEffect(() => {
    if (!ownerId || !currentState || !selectedUserId) {
      return;
    }

    const uid = ownerId;
    const recipientId = selectedUserId;
    let active = true;

    const q = query(
      collection(db, 'messages'),
      where('senderId', '==', uid),
      where('recipientId', '==', recipientId),
      orderBy('createdAt', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!active) return;

      const messagesList: Message[] = [];

      snapshot.forEach((messageDoc) => {
        messagesList.push({
          ...messageDoc.data(),
          id: messageDoc.id,
          createdAt: messageDoc.data().createdAt?.toDate(),
        } as Message);
      });

      setMessagingState((previous) => {
        if (
          !previous ||
          previous.ownerId !== uid ||
          previous.selectedUserId !== recipientId
        ) {
          return previous;
        }

        return {
          ...previous,
          messages: {
            recipientId,
            items: messagesList,
          },
        };
      });
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [ownerId, selectedUserId, Boolean(currentState)]);

  const selectConversation = (recipientId: string) => {
    if (!ownerId) return;

    setMessagingState((previous) => {
      if (
        !previous ||
        previous.ownerId !== ownerId ||
        !previous.conversations.some(
          (conversation) => conversation.id === recipientId
        )
      ) {
        return previous;
      }

      if (previous.selectedUserId === recipientId) {
        return previous;
      }

      return {
        ...previous,
        selectedUserId: recipientId,
        messages: null,
        messageText: '',
      };
    });
  };

  const updateMessageText = (value: string) => {
    if (!ownerId) return;

    setMessagingState((previous) =>
      previous?.ownerId === ownerId
        ? { ...previous, messageText: value }
        : previous
    );
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    if (
      !ownerId ||
      !currentState ||
      !selectedUserId ||
      !messageText.trim() ||
      sendingOwnerRef.current === ownerId
    ) {
      return;
    }

    const senderId = ownerId;
    const recipientId = selectedUserId;
    const text = messageText;

    sendingOwnerRef.current = senderId;
    setSending(true);

    try {
      await addDoc(collection(db, 'messages'), {
        senderId,
        recipientId,
        text,
        createdAt: Timestamp.now(),
        read: false,
      });

      setMessagingState((previous) => {
        if (
          !previous ||
          previous.ownerId !== senderId ||
          previous.selectedUserId !== recipientId
        ) {
          return previous;
        }

        return {
          ...previous,
          messageText:
            previous.messageText === text
              ? ''
              : previous.messageText,
        };
      });

      if (activeOwnerRef.current === senderId) {
        toast.success('Message sent!');
      }
    } catch {
      if (activeOwnerRef.current === senderId) {
        toast.error('Failed to send message');
      }
    } finally {
      if (
        activeOwnerRef.current === senderId &&
        sendingOwnerRef.current === senderId
      ) {
        sendingOwnerRef.current = null;
        setSending(false);
      }
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
    return (
      <div className="text-center py-12">
        Please sign in to view messages
      </div>
    );
  }

  if (!currentState) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-96 md:h-full">
        {/* Conversations List */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-200">
            <h2 className="font-bold text-lg">Messages</h2>
          </div>

          {currentState.loading ? (
            <div className="flex items-center justify-center h-full">
              <LoadingSpinner />
            </div>
          ) : currentState.conversations.length === 0 ? (
            <div className="p-4 text-center text-gray-500">
              No conversations yet
            </div>
          ) : (
            <div className="overflow-y-auto">
              {currentState.conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => selectConversation(conv.id)}
                  className={`w-full p-4 border-b border-gray-100 text-left hover:bg-gray-50 transition ${
                    selectedUserId === conv.id
                      ? 'bg-blue-50 border-l-4 border-l-blue-600'
                      : ''
                  }`}
                >
                  <p className="font-semibold text-sm">
                    {conv.displayName}
                  </p>
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
                  <div
                    key={msg.id}
                    className={`flex ${
                      msg.senderId === user.id
                        ? 'justify-end'
                        : 'justify-start'
                    }`}
                  >
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

              <form
                onSubmit={handleSendMessage}
                className="p-4 border-t border-gray-200 flex gap-2"
              >
                <input
                  type="text"
                  value={messageText}
                  onChange={(e) =>
                    updateMessageText(e.target.value)
                  }
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
