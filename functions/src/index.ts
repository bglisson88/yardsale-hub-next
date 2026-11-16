import { initializeApp } from 'firebase-admin/app';

initializeApp();

export { registerPublicProfile, renameUsername } from './public-profile';
export { saveEventWithConsent, deleteEventWithConsent } from './event-consent';
