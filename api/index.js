export default async (req, res) => {
  const { reqHandler } = await import('../dist/bookly/server/server.mjs');
  return reqHandler(req, res);
};
