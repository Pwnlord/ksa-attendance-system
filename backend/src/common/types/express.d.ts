import "express";

interface AuthRequestContext {
  userId: string;
  sessionId: string;
  roles: string[];
}

declare module "express-serve-static-core" {
  interface Request {
    correlationId?: string;
    auth?: AuthRequestContext;
  }
}
