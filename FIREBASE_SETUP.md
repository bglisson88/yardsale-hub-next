# Firebase Setup Guide for YardSale Hub

This guide will walk you through setting up Firebase for your YardSale Hub marketplace.

## Table of Contents
1. [Create Firebase Project](#create-firebase-project)
2. [Enable Authentication](#enable-authentication)
3. [Create Firestore Database](#create-firestore-database)
4. [Set Up Storage](#set-up-storage)
5. [Get Firebase Credentials](#get-firebase-credentials)
6. [Add Credentials to .env.local](#add-credentials-to-envlocal)
7. [Set Up Security Rules](#set-up-security-rules)
8. [Test Your Setup](#test-your-setup)

---

## Step 1: Create Firebase Project

### 1.1 Go to Firebase Console
1. Open [Firebase Console](https://console.firebase.google.com/)
2. Click **"Add project"** button
3. Enter your project name:
   - **Project name:** `YardSale Hub` (or your preferred name)
   - **Project ID:** Firebase will auto-generate one (you can customize it)

### 1.2 Configure Project Settings
1. Check "Enable Google Analytics for this project" (optional but recommended)
2. Click **"Create project"**
3. Wait for the project to be created (1-2 minutes)

### 1.3 Register Your Web App
1. Click the **Web icon** (`</>`)
2. **App nickname:** `YardSale Hub Web`
3. Check "Also set up Firebase Hosting for this app" (optional)
4. Click **"Register app"**

💡 **You'll see your Firebase config here. Copy it for the next step.**

---

## Step 2: Enable Authentication

### 2.1 Navigate to Authentication
1. In Firebase Console sidebar, click **"Build"** → **"Authentication"**
2. Click **"Get started"**

### 2.2 Enable Email/Password Provider
1. Click the **"Email/Password"** option
2. Toggle **"Enable"** to ON
3. Click **"Save"**

### 2.3 (Optional) Add Authorized Domains
1. In Authentication → Settings → Authorized domains
2. Add your domains:
   - `localhost` (already added)
   - `your-domain.vercel.app` (when you deploy)
   - Your custom domain (if using one)

---

## Step 3: Create Firestore Database

### 3.1 Navigate to Firestore
1. In Firebase Console sidebar, click **"Build"** → **"Firestore Database"**
2. Click **"Create database"**

### 3.2 Configure Database
1. **Location:** Select the closest region to your users
   - US: `us-central1`
   - Europe: `europe-west1`
   - Asia: `asia-southeast1`
2. **Security rules:** Select **"Start in production mode"**
3. Click **"Create"**

💡 We'll update security rules after this step.

### 3.3 Create Collections

Firestore will auto-create collections as you add data, but here's what you'll have:

- **users** - User profiles
- **items** - Items for sale
- **yardSaleEvents** - Yard sale events
- **messages** - Messages between users
- **favorites** - Favorited items, sellers and events (doc ID `{userId}_{type}_{targetId}`; rules must be published in the Firebase console)

No need to create these manually now—they'll be created automatically.

---

## Step 4: Set Up Storage

### 4.1 Navigate to Storage
1. In Firebase Console sidebar, click **"Build"** → **"Storage"**
2. Click **"Get started"**

### 4.2 Configure Storage
1. **Default location:** Select the same region as Firestore
2. **Security rules:** Start with test rules (we'll update them)
3. Click **"Done"**

---

## Step 5: Get Firebase Credentials

### 5.1 Find Your Config
1. Go to **Project Settings** (gear icon in top-left)
2. Click **"General"** tab
3. Scroll down to **"Your apps"** section
4. Find your web app and click **"Config"**
5. Copy the entire config object that looks like:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "your-project-id.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project-id.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef123456"
};
```

---

## Step 6: Add Credentials to .env.local

### 6.1 Update Your .env.local File

1. Open your project folder and find `.env.local` (or create it if it doesn't exist)

2. Copy the values from your Firebase config and add them:

```env
# Firebase Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=YOUR_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abcdef123456

# App Configuration
NEXT_PUBLIC_APP_NAME=YardSale Hub
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 6.2 Never Commit .env.local

Make sure `.env.local` is in your `.gitignore` file (it should be by default).

---

## Step 7: Set Up Security Rules

### 7.1 Set Firestore Rules

1. Go to **Firestore Database** → **Rules** tab
2. Replace the default rules with:

```firestore
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users collection - anyone can read, only owner can write
    match /users/{userId} {
      allow read: if true;
      allow create: if request.auth.uid == userId;
      allow delete: if request.auth.uid == userId;
      // Owner may edit their profile but not rating fields; other signed-in
      // users may only update rating fields (client-side aggregates).
      allow update: if (request.auth.uid == userId
                        && !request.resource.data.diff(resource.data).affectedKeys()
                             .hasAny(['averageRating', 'totalReviews', 'ratingBreakdown']))
                    || (request.auth != null && request.auth.uid != userId
                        && request.resource.data.diff(resource.data).affectedKeys()
                             .hasOnly(['averageRating', 'totalReviews', 'ratingBreakdown'])
                        && request.resource.data.averageRating >= 0
                        && request.resource.data.averageRating <= 5
                        && request.resource.data.totalReviews >= 0);
    }

    // Reviews - signed-in users can read; one review per buyer per seller
    match /reviews/{reviewId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null
                    && request.resource.data.reviewerId == request.auth.uid
                    && request.resource.data.sellerId != request.auth.uid
                    && reviewId == request.resource.data.sellerId + '_' + request.auth.uid
                    && request.resource.data.rating is int
                    && request.resource.data.rating >= 1
                    && request.resource.data.rating <= 5
                    && request.resource.data.comment.size() <= 500;
      allow update: if request.auth.uid == resource.data.reviewerId
                    && request.resource.data.reviewerId == resource.data.reviewerId
                    && request.resource.data.sellerId == resource.data.sellerId
                    && request.resource.data.rating is int
                    && request.resource.data.rating >= 1
                    && request.resource.data.rating <= 5
                    && request.resource.data.comment.size() <= 500;
      allow delete: if request.auth.uid == resource.data.reviewerId;
    }

    // Items collection - anyone can read, only creator can write
    match /items/{itemId} {
      allow read: if true;
      allow create: if request.auth != null;
      allow update, delete: if request.auth.uid == resource.data.userId;
    }

    // Yard Sale Events - anyone can read, only creator can write
    match /yardSaleEvents/{eventId} {
      allow read: if true;
      allow create: if request.auth != null;
      allow update, delete: if request.auth.uid == resource.data.userId;
    }

    // Messages - only participants can read, only sender can create
    match /messages/{messageId} {
      allow read: if request.auth.uid == resource.data.senderId || 
                     request.auth.uid == resource.data.recipientId;
      allow create: if request.auth.uid == request.resource.data.senderId;
    }

    // Favorites - owner-only read/delete, no updates.
    // Doc ID must be {uid}_{type}_{targetId}
    match /favorites/{favoriteId} {
      allow read, delete: if request.auth != null && request.auth.uid == resource.data.userId;
      allow create: if request.auth != null
                    && request.resource.data.userId == request.auth.uid
                    && request.resource.data.type in ['item', 'seller', 'event']
                    && favoriteId == request.auth.uid + '_' + request.resource.data.type + '_' + request.resource.data.targetId;
      allow update: if false;
    }
  }
}
```

3. Click **"Publish"**

### 7.2 Set Storage Rules (includes `avatars/{userId}/**` for profile pictures)

1. Go to **Storage** → **Rules** tab
2. Replace the default rules with:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Item photos
    match /items/{userId}/{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.uid == userId;
    }

    // Event photos
    match /events/{userId}/{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.uid == userId;
    }

    // Profile pictures (avatars) - public read, owner write
    match /avatars/{userId}/{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.uid == userId
                   && request.resource.size < 5 * 1024 * 1024;
    }
  }
}
```

3. Click **"Publish"**

Because `users` documents are only readable by signed-in users, the poster's name and photo are copied onto each event (`posterName`, `posterPhotoURL`) and item (`sellerName`, `sellerPhotoURL`) when created, so signed-out visitors can see them.

---

## Step 8: Test Your Setup

### 8.1 Install Dependencies

```bash
cd yardsale-hub-next
npm install
```

### 8.2 Start Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 8.3 Test Firebase Connection

1. **Sign Up:**
   - Click "Get Started" or "Sign In"
   - Go to "Create Account" tab
   - Enter:
     - Name: `Test User`
     - Email: `test@example.com`
     - Password: `TestPassword123!`
     - Location: `Nederland`
   - Click "Create Account"

2. **Check Firebase Console:**
   - Go to Firebase Console → Authentication
   - You should see your new user in the "Users" tab
   - Check Firestore Database → `users` collection
   - You should see a document with your user data

3. **Test Upload (Optional):**
   - Click "Sell" to post an item
   - Upload a photo
   - Check Firebase Console → Storage
   - You should see your image in `/items/[userId]/`

✅ **If you see your user and data in Firebase, setup is complete!**

---

## Troubleshooting

### Problem: "apiKey is not defined"
**Solution:** Make sure `.env.local` has all Firebase variables and restart the dev server.

### Problem: "Permission denied" when uploading
**Solution:** Check Storage rules. Make sure user ID is correct.

### Problem: "User not created in Firestore"
**Solution:** Wait 30 seconds for sync. Check browser console for errors.

### Problem: "Cannot read property 'uid' of null"
**Solution:** Make sure you're signed in before accessing user-protected features.

---

## Environment Variables for Vercel

When deploying to Vercel:

1. Go to your Vercel project settings
2. Click **"Environment Variables"**
3. Add each variable:
   - `NEXT_PUBLIC_FIREBASE_API_KEY`
   - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
   - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
   - `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
   - `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
   - `NEXT_PUBLIC_FIREBASE_APP_ID`
   - `NEXT_PUBLIC_APP_NAME=YardSale Hub`
   - `NEXT_PUBLIC_APP_URL=your-vercel-domain.vercel.app`

4. Redeploy your project

---

## Monitoring Your Database

### View Your Data
1. Go to Firebase Console → Firestore Database
2. Click on any collection to view documents
3. Click on a document to see its data

### View Your Users
1. Go to Firebase Console → Authentication
2. See all signed-up users
3. Check email, creation date, last sign-in

### View Your Storage
1. Go to Firebase Console → Storage
2. Browse folders by user ID
3. See all uploaded images

---

## Next Steps

✅ You've completed Firebase setup!

Now you can:
- Run locally: `npm run dev`
- Sign up users
- Post items with photos
- Create yard sale events
- Send messages
- Deploy to Vercel

For questions or issues, check the main README.md or SETUP_GUIDE.md.
"