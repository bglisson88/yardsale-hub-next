export interface User {
  id: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  location: string;
  bio: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface YardSaleEvent {
  id: string;
  userId: string;
  title: string;
  description: string;
  location: string;
  address: string;
  latitude: number;
  longitude: number;
  startDate: Date;
  endDate: Date;
  photoURL: string | null;
  createdAt: Date;
  updatedAt: Date;
  itemCount: number;
}

export interface Item {
  id: string;
  userId: string;
  yardSaleId?: string; // Optional - can be standalone or part of a yard sale
  title: string;
  description: string;
  category: string;
  price: number;
  originalPrice?: number;
  condition: 'new' | 'like-new' | 'good' | 'fair' | 'poor';
  location: string;
  photoURLs: string[];
  createdAt: Date;
  updatedAt: Date;
  views: number;
  isSold: boolean;
}

export interface Message {
  id: string;
  senderId: string;
  recipientId: string;
  itemId?: string;
  text: string;
  createdAt: Date;
  read: boolean;
}

export interface Favorite {
  id: string;
  userId: string;
  itemId: string;
  createdAt: Date;
}

export interface Conversation {
  id: string;
  participants: string[]; // [userId1, userId2]
  lastMessage: string;
  lastMessageTime: Date;
  unreadCount: number;
}
