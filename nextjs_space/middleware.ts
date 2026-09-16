import { withAuth } from "next-auth/middleware";

export const config = {
  matcher: [
    // Protect these routes
    "/dashboard/:path*",
    "/profile/:path*",
    "/api/user/:path*",
    "/api/routes/:path*",
    "/api/emergency/:path*",
    "/api/safety/:path*",
  ],
};

export default withAuth(
  function middleware(req) {
    return null;
  },
  {
    pages: {
      signIn: "/login",
    },
  }
);
