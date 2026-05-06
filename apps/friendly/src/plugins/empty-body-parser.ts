import fp from 'fastify-plugin';

// Override fastify's default JSON parser so an empty body on a POST/PUT
// request that declares Content-Type: application/json is treated as `{}`
// instead of being rejected with "Body cannot be empty…". This lets clients
// fire actionless POSTs (e.g., /providers/:id/test) without having to send
// a placeholder payload.
export default fp(async (app) => {
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (_req, body, done) => {
      const text = (body as string).trim();
      if (text.length === 0) {
        done(null, {});
        return;
      }
      try {
        done(null, JSON.parse(text));
      } catch (err) {
        const e = err as Error & { statusCode?: number };
        e.statusCode = 400;
        done(e, undefined);
      }
    },
  );
});
