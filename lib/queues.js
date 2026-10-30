function createQueues(isWin) {
  const tails = /* @__PURE__ */ new Map();
  const keyOf = (root) => {
    const k = String(root == null ? "" : root);
    return k !== "" && isWin ? k.toLowerCase() : k;
  };
  function tailFor(key) {
    return tails.get(key) || Promise.resolve();
  }
  function enqueueFor(root, task) {
    const key = keyOf(root);
    const run = tailFor(key).then(task);
    tails.set(key, run.catch(() => {
    }));
    return run;
  }
  function enqueueMany(roots, task) {
    const keys = Array.from(new Set(roots.map(keyOf)));
    if (keys.length === 0) keys.push("");
    const run = Promise.all(keys.map(tailFor)).then(task);
    const tail = run.catch(() => {
    });
    for (const key of keys) tails.set(key, tail);
    return run;
  }
  return { enqueueFor, enqueueMany };
}
export {
  createQueues
};
