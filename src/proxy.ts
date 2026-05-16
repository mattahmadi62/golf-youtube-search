import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const user = process.env.ADMIN_USER;
  const pass = process.env.ADMIN_PASS;

  // Fail closed: if either credential isn't set, reject everything under /admin.
  if (!user || !pass) {
    return new NextResponse("Admin disabled", { status: 503 });
  }

  const header = request.headers.get("authorization") ?? "";
  const expected = "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");

  if (header !== expected) {
    return new NextResponse("Auth required", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="caddiereel-admin"' },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/admin/:path*",
};
