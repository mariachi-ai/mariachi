---
'@mariachi/auth': minor
'@mariachi/auth-workos': minor
'@mariachi/auth-fusionauth': minor
---

`IdentityClient`: email codes (`startEmailCode`, `signInWithEmailCode`), finishing a sign-in held at email verification (`pendingVerificationCode`, `verifyEmailAndSignIn`), `resetPassword` and `setPassword`. `sendPasswordReset` now returns who sends the email: `{ deliveredBy: 'app', token, url }` (the app emails it), `'provider'`, or `'nobody'` (no such account). `@mariachi/auth-workos` gains `emailsSentBy` (`'app'` by default: WorkOS's own emails off). FusionAuth implements the codes with its passwordless API and `setPassword` with the User API; held sign-ins and app-side resets stay FusionAuth's own (`auth/not-supported`).
