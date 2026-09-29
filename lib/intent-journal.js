const INTENT_VERSION = 1;
function describeIntent(intent) {
  return "message=" + intent.messageId + ", phase=" + intent.phase + ", safety=snap-" + intent.safetyId;
}
function createIntentJournal(deps) {
  const handled = /* @__PURE__ */ new Set();
  function intentFile(store) {
    return store.dir + (deps.isWin ? "\\" : "/") + "recall-intent.json";
  }
  async function readRaw(store) {
    let raw = "";
    try {
      raw = deps.scripts.stripBom(await deps.runShell(deps.scripts.fileReadCmd(intentFile(store)), { timeoutMs: 3e4, stdoutMaxBytes: 65536 })).trim();
    } catch (error) {
      return { ok: false, intent: null };
    }
    if (!raw) return { ok: true, intent: null };
    try {
      const obj = JSON.parse(raw);
      if (!obj || obj.v !== INTENT_VERSION || obj.op !== "execute" || typeof obj.messageId !== "string" || !obj.messageId || typeof obj.safetyId !== "string" || !obj.safetyId || obj.phase !== "rollback" && obj.phase !== "rescue") {
        return { ok: true, intent: null };
      }
      return {
        ok: true,
        intent: {
          v: INTENT_VERSION,
          op: "execute",
          messageId: obj.messageId,
          root: typeof obj.root === "string" ? obj.root : "",
          safetyId: obj.safetyId,
          safetyOk: obj.safetyOk !== false,
          phase: obj.phase,
          time: typeof obj.time === "number" ? obj.time : 0
        }
      };
    } catch (error) {
      return { ok: true, intent: null };
    }
  }
  async function write(store, text) {
    try {
      await deps.writeTextViaShell(intentFile(store), text);
    } catch (error) {
      deps.recordError("recall intent journal write failed: " + String(error));
    }
  }
  function read(store) {
    return readRaw(store).then((r) => r.intent);
  }
  async function begin(store, root, fields) {
    const intent = {
      v: INTENT_VERSION,
      op: "execute",
      messageId: fields.messageId,
      root,
      safetyId: fields.safetyId,
      safetyOk: fields.safetyOk,
      phase: "rollback",
      time: Date.now()
    };
    await write(store, JSON.stringify(intent));
  }
  async function advance(store, phase) {
    const cur = await read(store);
    if (cur) await write(store, JSON.stringify(Object.assign({}, cur, { phase })));
  }
  function clear(store) {
    return write(store, "");
  }
  async function recover(store) {
    if (handled.has(store.dir)) return false;
    const got = await readRaw(store);
    if (!got.ok) return false;
    const intent = got.intent;
    if (!intent) {
      handled.add(store.dir);
      return false;
    }
    if (await deps.workspaceMatchesTag(intent.messageId)) {
      await clear(store);
      handled.add(store.dir);
      return true;
    }
    if (!intent.safetyOk) {
      deps.recordError("recall interrupted rollback detected, no safety snapshot: " + describeIntent(intent) + "\uFF08\u8BB0\u5F55\u4FDD\u7559\u4E8E " + intentFile(store) + "\uFF09");
      handled.add(store.dir);
      return true;
    }
    if (deps.agentBusy(intent.root)) {
      deps.recordError("recall interrupted rollback deferred (agent busy): " + describeIntent(intent));
      return false;
    }
    const reset = await deps.resetToSafety(store, intent.safetyId, intent.root);
    if (!reset) {
      deps.recordError("recall interrupted rollback rescue failed: " + describeIntent(intent) + "\uFF08\u8BB0\u5F55\u4FDD\u7559\u4E8E " + intentFile(store) + "\uFF09");
      handled.add(store.dir);
      return true;
    }
    await clear(store);
    handled.add(store.dir);
    deps.recordError("recovered interrupted rollback: " + describeIntent(intent) + " \u2014 \u5DE5\u4F5C\u533A\u5DF2\u590D\u4F4D\u5230\u5B89\u5168\u5FEB\u7167");
    return true;
  }
  return { begin, advance, clear, read, file: intentFile, recover };
}
export {
  createIntentJournal
};
