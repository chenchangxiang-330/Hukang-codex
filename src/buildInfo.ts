// GitHub Actions replaces this value with the exact checked-out source revision.
// A local Metro session must not claim to be a verified cloud APK.
export const buildInfo = { sourceCommit: null as string | null, version: "1.4.0", channel: "local" };
