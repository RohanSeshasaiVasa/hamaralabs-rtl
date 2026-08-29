import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { cookies } from "next/headers";
import { verifyToken, hashCode, OTP_COOKIE } from "@/lib/auth";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        code: { label: "Code", type: "text" },
      },
      authorize: async (credentials) => {
        const email = typeof credentials?.email === "string" ? credentials.email : "";
        const code = typeof credentials?.code === "string" ? credentials.code : "";
        if (!email || !code) return null;

        const cookieStore = await cookies();
        const challenge = verifyToken<{ exp: number; email: string; codeHash: string }>(
          cookieStore.get(OTP_COOKIE)?.value
        );

        if (!challenge || challenge.email !== email || challenge.codeHash !== hashCode(code)) {
          return null;
        }

        cookieStore.delete(OTP_COOKIE);
        return { id: email, email };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.email) token.email = user.email;
      return token;
    },
    session({ session, token }) {
      if (session.user && token.email) session.user.email = token.email;
      return session;
    },
  },
});
