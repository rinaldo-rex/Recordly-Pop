# Recording permissions and optional accounts

Local recording, editing, playback, and file export do not require an account.
Fresh startup opens the app directly, including when Supabase is unavailable.
`OnboardingController` only responds to explicit or pending OS permission requests
and shows `RecordingPermissionsDialog`, which reuses `OnboardingPermissions`.
Guests can finish permission setup without creating a cloud session. macOS Screen
Recording and Accessibility checks, and capture-time microphone/camera/portal
prompts, remain in place.

Account sign-in remains available on demand for account and cloud-sharing features
through `RecordlySignInDialog`. It still uses real Supabase email/OAuth sessions;
local mode does not fabricate a user, token, or cloud entitlement. Its optional
account artwork/layout remains in `OnboardingLayout.tsx`, using
`public/auth/login-banner.png`.
