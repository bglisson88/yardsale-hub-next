# YardSale Hub - Next.js Setup Guide

## Quick Start

This guide will help you set up and deploy YardSale Hub on Vercel.

### Prerequisites

- Node.js 18 or higher
- Git
- GitHub account
- Firebase account
- Vercel account

### Step 1: Clone the Repository

```bash
git clone https://github.com/bglisson88/yardsale-hub-next.git
cd yardsale-hub-next
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Set Up Firebase

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create a new project or use an existing one
3. Enable Authentication:
   - Go to Authentication → Sign-in method
   - Enable Email/Password
4. Create a Firestore Database:
   - Go to Firestore Database
   - Create database in production mode
   - Set location to your preferred region
5. Set up Storage:
   - Go to Storage
   - Create a bucket
6. Get your Firebase config:
   - Go to Project Settings → General
   - Copy the Firebase SDK snippet

### Step 4: Configure Environment Variables

1. Copy the example env file:

```bash
cp .env.example .env.local
```

2. Fill in your Firebase credentials in `.env.local`:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

NEXT_PUBLIC_APP_NAME=YardSale Hub
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Step 5: Set Up Firestore Rules

Go to Firestore → Rules and replace the default rules with:

```firestore
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users collection
    match /users/{userId} {
      allow read: if true;
      allow create, update, delete: if request.auth.uid == userId;
    }

    // Items collection
    match /items/{itemId} {
      allow read: if true;
      allow create, update, delete: if request.auth.uid == resource.data.userId;
    }

    // Yard Sale Events collection
    match /yardSaleEvents/{eventId} {
      allow read: if true;
      allow create, update, delete: if request.auth.uid == resource.data.userId;
    }

    // Messages collection
    match /messages/{messageId} {
      allow read: if request.auth.uid == resource.data.senderId || request.auth.uid == resource.data.recipientId;
      allow create: if request.auth.uid == request.resource.data.senderId;
    }

    // Favorites collection
    match /favorites/{favoriteId} {
      allow read, create, delete: if request.auth.uid == resource.data.userId;
    }
  }
}
```

### Step 6: Set Up Storage Rules

Go to Storage → Rules and replace with:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{userId}/{allPaths=**} {
      allow read: if true;
      allow write: if request.auth.uid == userId && request.resource.size < 10 * 1024 * 1024;
    }
  }
}
```

### Step 7: Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Deploy to Vercel

### Option 1: Via GitHub (Recommended)

1. Push your code to GitHub
2. Go to [Vercel](https://vercel.com)
3. Click "New Project"
4. Select your repository
5. Add environment variables from `.env.local`
6. Click "Deploy"

### Option 2: Via CLI

```bash
npm install -g vercel
vercel login
vercel
```

Follow the prompts and add your environment variables.

## Project Structure

```
src/
├── app/                    # Next.js app directory
│   ├── layout.tsx         # Root layout
│   ├── page.tsx           # Home page
│   ├── auth/              # Authentication
│   │   ├── login/         # Login page
│   │   └── signup/        # Sign up page
│   ├── dashboard/         # User dashboard
│   ├── items/             # Item listings
│   │   └── new/           # Post new item
│   ├── events/            # Yard sale events
│   │   └── new/           # Create new event
│   └── messages/          # Messaging
├── components/            # Reusable components
│   ├── Navbar.tsx
│   ├── Footer.tsx
│   ├── Logo.tsx
│   ├── LoadingSpinner.tsx
│   └── EmptyState.tsx
├── hooks/                 # Custom React hooks
│   ├── useAuthContext.ts  # Auth state management
│   └── useItems.ts        # Items data fetching
├── lib/
│   └── firebase.ts        # Firebase configuration
├── store/                 # Zustand state management
│   ├── authStore.ts       # Auth store
│   └── itemStore.ts       # Items store
├── types/                 # TypeScript types
│   └── index.ts
└── app/
    └── globals.css        # Global styles
```

## Features Implemented

✅ User Authentication (Firebase Auth)
✅ User Profiles
✅ Post Items for Sale
✅ Create Yard Sale Events
✅ Browse Items & Events
✅ Direct Messaging
✅ Image Upload to Firebase Storage
✅ Responsive Design
✅ Modern UI with Tailwind CSS

## Key Technologies

- **Next.js 14** - React framework
- **TypeScript** - Type safety
- **Firebase** - Backend services
- **Tailwind CSS** - Styling
- **Zustand** - State management
- **React Hot Toast** - Notifications
- **Lucide React** - Icons
- **Vercel** - Hosting

## Environment Variables

```env
# Firebase Configuration
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID

# App Configuration
NEXT_PUBLIC_APP_NAME
NEXT_PUBLIC_APP_URL
```

## Common Issues & Solutions

### Issue: "Firebase config not found"
**Solution:** Make sure all environment variables in `.env.local` are set correctly.

### Issue: "Permission denied" when uploading images
**Solution:** Check your Firebase Storage rules. Make sure they match the rules provided above.

### Issue: "User not found" after sign up
**Solution:** Wait a moment for Firestore to sync. The user document is created automatically.

## Next Steps

1. Customize the logo in `src/components/Logo.tsx`
2. Add more categories and filters
3. Implement map view for yard sales
4. Add reviews and ratings
5. Set up email notifications
6. Add social media sharing
7. Create admin dashboard

## Support

For issues or questions:
1. Check the README.md in the root directory
2. Review Firebase documentation
3. Check Next.js documentation

## License

MIT
