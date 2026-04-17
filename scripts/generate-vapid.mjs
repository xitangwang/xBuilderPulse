#!/usr/bin/env node
import webpush from 'web-push';

const { publicKey, privateKey } = webpush.generateVAPIDKeys();

console.log('# Copy these into your .env or Vercel project settings:');
console.log(`PUBLIC_VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log(`# VAPID_SUBJECT=mailto:you@example.com`);
