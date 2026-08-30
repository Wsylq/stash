import type { FastifyReply, FastifyRequest } from 'fastify';
import { verifyToken } from './auth.js';

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

export function requireAuth(req: FastifyRequest, secret: string): { userId: string; email: string } {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw new HttpError(401, 'Not authenticated');
  }
  const payload = verifyToken(header.slice('Bearer '.length), secret);
  if (!payload) throw new HttpError(401, 'Session expired or invalid');
  return { userId: payload.sub, email: payload.email };
}

export function dumpError(err: unknown): { code: number; message: string } {
  if (err instanceof HttpError) return { code: err.status, message: err.message };
  if (err instanceof Error) return { code: 500, message: err.message };
  return { code: 500, message: String(err) };
}

export function sendError(reply: FastifyReply, err: unknown): FastifyReply {
  const { code, message } = dumpError(err);
  return reply.code(code).send({ error: message });
}