// OAuth sign-in is disabled in the Azure SQL build. Email + password only.
// This shim is kept so existing imports still resolve.
type SignInOptions = { redirect_uri?: string; extraParams?: Record<string, string> };

export const lovable = {
  auth: {
    signInWithOAuth: async (_provider: string, _opts?: SignInOptions) => {
      return { error: new Error("OAuth sign-in is disabled in the Azure SQL build.") };
    },
  },
};
