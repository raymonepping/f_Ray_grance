// Minimal fastify-plugin equivalent: skip encapsulation so hooks/decorators apply app-wide.
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

export default function fp<T>(fn: (app: FastifyInstance, opts: T) => Promise<void>): FastifyPluginAsync<T & object> {
  const wrapped = fn as unknown as FastifyPluginAsync<T & object> & Record<symbol, boolean>;
  wrapped[Symbol.for('skip-override')] = true;
  return wrapped;
}
