import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not set");
}

const JWT_EXPIRE_MINUTES = 1440;
const SECRET_BYTES = new TextEncoder().encode(JWT_SECRET);

export interface JwtPayload {
  sub: string;
  username: string;
  display_name: string;
}

export interface CurrentUser {
  id: string;
  username: string;
  display_name: string;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(plain: string, hashed: string): Promise<boolean> {
  return bcrypt.compare(plain, hashed);
}

export async function createAccessToken(payload: JwtPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(`${JWT_EXPIRE_MINUTES}m`)
    .sign(SECRET_BYTES);
}

export async function decodeAccessToken(token: string): Promise<JwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET_BYTES);
    if (typeof payload.sub !== "string") return null;
    return {
      sub: payload.sub,
      username: payload.username as string,
      display_name: payload.display_name as string,
    };
  } catch {
    return null;
  }
}

export async function getCurrentUser(request: Request): Promise<CurrentUser | null> {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;

  const payload = await decodeAccessToken(auth.slice(7));
  if (!payload?.sub) return null;

  return {
    id: payload.sub,
    username: payload.username,
    display_name: payload.display_name,
  };
}
