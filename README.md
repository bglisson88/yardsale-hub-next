# YardSale Hub - Next.js Edition

A modern, full-featured marketplace for discovering and organizing local yard sales. Built with Next.js 14, Firebase, and Tailwind CSS.

## Features

- 🔐 **User Authentication** - Sign up/login with Firebase Auth
- 🏷️ **Yard Sale Events** - Create and manage upcoming yard sales
- 📦 **Item Listings** - Post items for individual or yard sale events
- 💬 **Direct Messaging** - Chat between buyers and sellers
- ❤️ **Favorites** - Save items you're interested in
- 🗺️ **Location-based Search** - Find sales near you
- 📅 **Event Calendar** - Browse upcoming yard sales by date
- 📸 **Image Upload** - Upload item photos to Firebase Storage
- 📱 **Mobile Responsive** - Works seamlessly on all devices

## Tech Stack

- **Frontend**: Next.js 14, React 18, TypeScript
- **Styling**: Tailwind CSS
- **Backend**: Firebase (Auth, Firestore, Storage)
- **Deployment**: Vercel
- **UI Components**: Lucide React (icons)
- **State Management**: Zustand
- **Notifications**: React Hot Toast

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Firebase project (create at https://firebase.google.com)

### Installation

1. Clone the repository

```bash
git clone https://github.com/bglisson88/yardsale-hub-next.git
cd yardsale-hub-next
```

2. Install dependencies

```bash
npm install
```

3. Set up environment variables

```bash
cp .env.example .env.local
```

Then fill in your Firebase credentials in `.env.local`

4. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Firebase Setup

1. Create a Firebase project at https://firebase.google.com/console
2. Enable Authentication (Email/Password)
3. Create a Firestore database
4. Set up Storage for image uploads
5. Copy your config to `.env.local`

## Project Structure

```
src/
├── app/                    # Next.js app directory
│   ├── layout.tsx         # Root layout
│   ├── page.tsx           # Home page
│   ├── auth/              # Authentication pages
│   ├── dashboard/         # User dashboard
│   ├── events/            # Yard sale events
│   ├── items/             # Item listings
│   └── messages/          # Messaging
├── components/             # Reusable components
├── lib/                   # Utilities and Firebase config
├── hooks/                 # Custom React hooks
├── types/                 # TypeScript types
└── store/                 # Zustand store for state management
```

## Development

```bash
# Development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Type checking
npm run type-check
```

## Deployment

This project is configured for Vercel:

1. Push code to GitHub
2. Connect repository to Vercel
3. Add environment variables in Vercel dashboard
4. Deploy automatically on push to main

## License

MIT
