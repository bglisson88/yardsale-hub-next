# Vercel Deployment Checklist

Before deploying to Vercel, make sure you've completed these steps:

## Firebase Setup
- [ ] Created Firebase project
- [ ] Enabled Email/Password authentication
- [ ] Created Firestore database (production mode)
- [ ] Created Storage bucket
- [ ] Copied Firebase config to `.env.local`
- [ ] Set up Firestore security rules
- [ ] Set up Storage security rules

## Environment Variables
- [ ] Created `.env.local` with all Firebase variables
- [ ] Tested locally with `npm run dev`
- [ ] All features working locally (auth, items, events, messaging)

## Code Quality
- [ ] Run `npm run type-check` - no errors
- [ ] Run `npm run build` - builds successfully
- [ ] No console errors or warnings

## Vercel Configuration
- [ ] GitHub repository is public and up to date
- [ ] All changes committed and pushed to main branch
- [ ] Ready to connect to Vercel

## Deployment Steps

1. Go to https://vercel.com
2. Click "New Project"
3. Select your GitHub repository
4. Under "Environment Variables", add:
   - `NEXT_PUBLIC_FIREBASE_API_KEY`
   - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
   - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
   - `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
   - `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
   - `NEXT_PUBLIC_FIREBASE_APP_ID`
   - `NEXT_PUBLIC_APP_NAME=YardSale Hub`
   - `NEXT_PUBLIC_APP_URL=https://your-domain.vercel.app`
5. Click "Deploy"
6. Test all features on deployed site

## Post-Deployment
- [ ] Test sign up and login
- [ ] Test posting an item
- [ ] Test creating a yard sale event
- [ ] Test messaging
- [ ] Test image upload
- [ ] Check mobile responsiveness
- [ ] Monitor Vercel Analytics

## Custom Domain (Optional)
- [ ] Purchase domain
- [ ] Add domain to Vercel project
- [ ] Update Firebase auth domain whitelist
- [ ] Update `NEXT_PUBLIC_APP_URL` in Vercel

