const reqHandlerPromise = import('../dist/bookly/server/server.mjs').then(
  (mod) => mod.reqHandler,
);

export default async (req, res) => {
  const reqHandler = await reqHandlerPromise;
  return reqHandler(req, res);
};
