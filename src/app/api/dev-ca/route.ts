import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// Development-only route: serves the mkcert root CA so mobile devices
// can install it and trust the local HTTPS certificate.
// Remove this file before deploying to production.
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not found", { status: 404 });
  }

  const caPath = join(
    homedir(),
    "AppData",
    "Local",
    "mkcert",
    "rootCA.pem"
  );

  if (!existsSync(caPath)) {
    return new NextResponse("CA not found", { status: 404 });
  }

  const cert = readFileSync(caPath);
  return new NextResponse(cert, {
    headers: {
      "Content-Type": "application/x-pem-file",
      "Content-Disposition": 'attachment; filename="mkcert-root-ca.pem"',
    },
  });
}
