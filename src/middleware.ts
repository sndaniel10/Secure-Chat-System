import { NextResponse } from "next/server";

// Auth is now handled client-side via JWT in localStorage.
// This middleware is a pass-through.
export function middleware() {
  return NextResponse.next();
}

export const config = {
  matcher: [],
};
