# Activate Codeora sign-in and cloud progress

The login interface and Firebase integration are included, but real sign-in needs a Firebase project owned by the site operator. Do not ask learners to paste credentials. Configure the project once before deployment.

## 1. Create and register the Firebase web app

1. Open https://console.firebase.google.com/ and create a Firebase project.
2. In Project settings, add a Web app and copy its Firebase config object.
3. Open `firebase-config.js` and replace the placeholder values for `apiKey`, `authDomain`, `projectId`, and `appId` with the values from that web app. The Firebase web config is intended for browser use; never place a service-account private key or Admin SDK credential in this file.
4. The project currently loads the modular Firebase JavaScript SDK 13.4.0 from Google's CDN, matching Firebase's current browser-module setup instructions. The static project remains vanilla HTML/CSS/JS; Firebase modules are loaded only after a real config is supplied.

## 2. Enable sign-in providers

In Firebase Console, open **Authentication → Sign-in method** and enable:

- **Google** — this also covers Google accounts using Gmail addresses. Gmail is not a separate authentication provider.
- **Facebook** — create a Facebook app in Meta for Developers, copy its App ID and App Secret into Firebase's Facebook provider configuration, and add the OAuth redirect URL Firebase displays to the Facebook app's Valid OAuth Redirect URIs.
- **GitHub** — create a GitHub OAuth app, then enter its Client ID and Client Secret in Firebase. Add the callback URL shown by Firebase to the GitHub OAuth app.
- **Email/Password** — enable the Email/Password method.
- **Phone** — enable phone sign-in and configure the project's SMS/verification requirements. Firebase uses reCAPTCHA on the web before sending an SMS. Tell learners that an SMS may arrive and standard rates may apply; obtain their consent. Firebase documents that phone numbers provided for auth are sent to and stored by Google for abuse prevention. SMS quotas, pricing, and regional restrictions may apply.

In **Authentication → Settings → Authorized domains**, add the exact domain where Codeora will be hosted. For Google/Facebook/GitHub/email testing, add `localhost` if it is not already listed. For GitHub Pages or another host, add that deployed hostname too. **Firebase phone authentication does not accept `localhost` as a hosted domain**; test SMS OTP from an authorized deployed hostname. Also set the SMS region policy to allow the countries you intend to serve (for an Indian audience, allow India / +91).

## 3. Enable Cloud Firestore and apply rules

1. In Firebase Console, create a Cloud Firestore database.
2. Open the Rules tab and publish the contents of the included `firestore.rules` file.
3. The rules allow a signed-in user to read/write only documents underneath their own `/users/{uid}/...` path. Do not replace these with public read/write rules.

Codeora stores the account record at `users/{uid}/querypath/progress`. It includes course answers/status, XP, streak, current selected question, bookmarks, and learner profile fields. Firebase Authentication identifies each user; Firestore rules enforce per-user access.

## 4. Test the flows

1. Run the project through a local server, not `file://`:
   `python3 -m http.server 5173`
2. Open `http://localhost:5173/login.html`.
3. Test email sign-up/sign-in first, then Google, Facebook, GitHub, and phone OTP after configuring each provider.
4. Complete a practice question. Refresh or reopen Codeora; the completed question should still have its check mark and the editor should resume at the next unfinished question.
5. Sign out and sign in with a different test account. Each account should see its own cloud record.
6. Sign in with the same account on a second authorized browser/device to verify cloud progress restoration.

## Notes

- Firebase config placeholders are intentional. Until replaced and the console setup is complete, the login page clearly reports that authentication is not configured; it does not pretend a user was signed in.
- Local progress continues to work without Firebase, using this browser's `localStorage`, so the standalone learning app still runs before cloud auth is activated.
- A first-time sign-in imports the browser's existing guest progress into the first account once. Later accounts do not inherit another account's saved browser data.
- The browser communicates with Firebase directly using the signed-in user's Firebase session. No admin key or private server credential is stored in the frontend.
