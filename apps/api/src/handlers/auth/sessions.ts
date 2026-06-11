import { type FastifyReply } from 'fastify';
import { asSingleHeader } from '@bossraid/shared-types';
import {
  OPS_SESSION_COOKIE_NAME,
  PUBLIC_SESSION_COOKIE_NAME,
  parseCookieHeader,
  serializeCookie,
} from '../../lib/http.js';
import { type ApiContext } from '../../api-context.js';

export function createSessionAuth(ctx: ApiContext) {
  function readOpsSession(
    headers: Record<string, string | string[] | undefined>
  ): { token: string; expiresAt: number } | undefined {
    const cookieHeader = asSingleHeader(headers.cookie);
    if (!cookieHeader) {
      return undefined;
    }

    const token = parseCookieHeader(cookieHeader)[OPS_SESSION_COOKIE_NAME];
    return ctx.controlState.readOpsSession(token);
  }

  function readPublicSession(
    headers: Record<string, string | string[] | undefined>
  ): { token: string; wallet: string; expiresAt: number } | undefined {
    const cookieHeader = asSingleHeader(headers.cookie);
    if (!cookieHeader) {
      return undefined;
    }

    const token = parseCookieHeader(cookieHeader)[PUBLIC_SESSION_COOKIE_NAME];
    return ctx.controlState.readPublicSession(token);
  }

  function issueOpsSession(reply: FastifyReply): { expiresAt: number } {
    const session = ctx.controlState.issueOpsSession(ctx.opsSessionTtlSec);
    reply.header(
      'set-cookie',
      serializeCookie(OPS_SESSION_COOKIE_NAME, session.token, {
        httpOnly: true,
        sameSite: 'Strict',
        path: '/ops-api',
        maxAge: ctx.opsSessionTtlSec,
        secure: ctx.env.NODE_ENV === 'production',
      })
    );
    return { expiresAt: session.expiresAt };
  }

  function clearOpsSession(
    reply: FastifyReply,
    headers: Record<string, string | string[] | undefined>
  ): void {
    const session = readOpsSession(headers);
    if (session) {
      ctx.controlState.clearOpsSession(session.token);
    }
    reply.header(
      'set-cookie',
      serializeCookie(OPS_SESSION_COOKIE_NAME, '', {
        httpOnly: true,
        sameSite: 'Strict',
        path: '/ops-api',
        maxAge: 0,
        secure: ctx.env.NODE_ENV === 'production',
      })
    );
  }

  function issuePublicSessionCookie(reply: FastifyReply, wallet: string): { expiresAt: number } {
    const session = ctx.controlState.issuePublicSession(wallet, ctx.publicSessionTtlSec);
    reply.header(
      'set-cookie',
      serializeCookie(PUBLIC_SESSION_COOKIE_NAME, session.token, {
        httpOnly: true,
        sameSite: 'Strict',
        path: '/',
        maxAge: ctx.publicSessionTtlSec,
        secure: ctx.env.NODE_ENV === 'production',
      })
    );
    return { expiresAt: session.expiresAt };
  }

  function clearPublicSession(
    reply: FastifyReply,
    headers: Record<string, string | string[] | undefined>
  ): void {
    const session = readPublicSession(headers);
    if (session) {
      ctx.controlState.clearPublicSession(session.token);
    }
    reply.header(
      'set-cookie',
      serializeCookie(PUBLIC_SESSION_COOKIE_NAME, '', {
        httpOnly: true,
        sameSite: 'Strict',
        path: '/',
        maxAge: 0,
        secure: ctx.env.NODE_ENV === 'production',
      })
    );
  }

  return {
    readOpsSession,
    readPublicSession,
    issueOpsSession,
    clearOpsSession,
    issuePublicSessionCookie,
    clearPublicSession,
  };
}
