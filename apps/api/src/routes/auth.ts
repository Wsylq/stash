import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { hashPassword, signToken, verifyPassword } from '../auth.js';
import { newId } from '../config.js';
import { countUsers, getDb, getUser, getUserByEmail } from '../db.js';
import { HttpError, requireAuth, sendError } from '../helpers.js';
import type { Config } from '../config.js';

const credentials = z.object({
  email: z.string().email().max(254).transform((v) => v.toLowerCase()),
  password: z.string().min(8).max(1024),
});

export function registerAuth(app: FastifyInstance, config: Config): void {
  const db = () => getDb();

  app.post('/api/v1/auth/register', async (req, reply) => {
    try {
      const { email, password } = credentials.parse(req.body);
      if (getUserByEmail(db(), email)) {
        throw new HttpError(409, 'An account with that email already exists');
      }
      const userCount = countUsers(db());
      if (userCount > 0 && !config.allowSignup) {
        throw new HttpError(403, 'This instance does not allow additional sign-ups');
      }
      const id = newId('u_');
      db().prepare('INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)')
        .run(id, email, hashPassword(password), new Date().toISOString());
      const token = signToken(id, email, config.secret);
      return reply.code(201).send({
        token,
        user: { id, email, createdAt: getUser(db(), id)?.created_at ?? new Date().toISOString() },
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return reply.code(400).send({ error: 'Invalid email or password (min 8 characters)' });
      }
      return sendError(reply, err);
    }
  });

  app.post('/api/v1/auth/login', async (req, reply) => {
    try {
      const { email, password } = credentials.parse(req.body);
      const user = getUserByEmail(db(), email);
      if (!user || !verifyPassword(password, user.password_hash)) {
        throw new HttpError(401, 'Incorrect email or password');
      }
      const token = signToken(user.id, user.email, config.secret);
      return reply.send({ token, user: { id: user.id, email: user.email, createdAt: user.created_at } });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return reply.code(400).send({ error: 'Invalid email or password' });
      }
      return sendError(reply, err);
    }
  });

  app.get('/api/v1/auth/me', async (req: FastifyRequest, reply) => {
    try {
      const { userId } = requireAuth(req, config.secret);
      const user = getUser(db(), userId);
      if (!user) throw new HttpError(401, 'Account no longer exists');
      return reply.send({ id: user.id, email: user.email, createdAt: user.created_at });
    } catch (err) {
      return sendError(reply, err);
    }
  });
}