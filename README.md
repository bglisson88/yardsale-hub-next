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

# Taxonomy and discovery regression tests (Node's built-in test runner)
npm test
```

## Categories and discovery

`src/lib/categories.ts` is the shared typed taxonomy for the 15 main categories
and their subcategories. Child IDs are scoped to their parent; optional
`itemTypes` leave room for a third level without requiring one. Navigation,
listing selectors, validation, and readable labels use this source.

- Browse links use encoded `category` and optional `subcategory` parameters.
  Parent results include listings with and without a child. Search and location
  combine with category filters; **Clear all filters** returns to all items.
- Legacy category names (including Furniture, Electronics, Tools, Clothing,
  Sports, Books, and Other) normalize through explicit aliases. Other/Misc map
  to Garage Sales, Bundles & Local Finds, without assigning a subcategory.
  Unknown legacy values remain intact and readable; unchanged legacy
  classifications are preserved when editing other fields. Changed
  classifications must pass current parent/child validation. No production data
  migration is performed. Owners can open **Edit listing** from browse results; existing
  listings may retain no subcategory. New listings require both selections.
- Writes validate the parent/child pairing before upload/save and omit absent
  optional category fields. Event membership (`yardSaleId`) stays independent
  from item classification and is preserved during edits.
- Homepage shortcuts link to fashion, home, an electronics **and** gaming group,
  and a collectibles group that also includes the named vintage fashion,
  kitchenware, and craft-supply subcategories. Parent-only legacy listings cannot
  reliably be identified as vintage and are not guessed into those subcategories.
- **Garage Sales Near Me** links to the existing upcoming-events page, not the
  item taxonomy's fifteenth category. This baseline has no GPS/radius discovery;
  item location filters match the stored city/ZIP text (case-insensitive).

### Prior menu work and scope

This work starts from current `main`, not `copilot/fix-dashboard-counts`.
The earlier [mega-menu task](https://github.com/bglisson88/yardsale-hub-next/tasks/aed8d442-676e-4f72-872f-252d8376a9aa)
produced [PR #17](https://github.com/bglisson88/yardsale-hub-next/pull/17), which was
closed without merging and targets that other branch. Its disclosure/navigation
pattern is adapted here for the shared taxonomy and current blue/white brand.
There is no merge dependency, and no other PR is merged by this change. If that
older menu is revived, reconcile its duplicate component rather than layering it
on top of this one.

Deferred: additional top categories, expanded condition/price/delivery/seller/
brand/size/color/material and vehicle-specific filters, richer event management,
and future moderation guidance for recalled or hygiene-sensitive products.
This update does not change the condition schema, introduce seller verification,
or claim moderation-policy enforcement.

## Deployment

This project is configured for Vercel:

1. Push code to GitHub
2. Connect repository to Vercel
3. Add environment variables in Vercel dashboard
4. Deploy automatically on push to main

## License

MIT
