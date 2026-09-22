const NON_NAME_CHARS = /[*?[\]\\/]/;
function dirNamePatterns(base) {
  if (!Array.isArray(base)) return [];
  const out = [];
  for (const raw of base) {
    if (typeof raw !== "string") continue;
    const t = raw.trim();
    if (!t || t.charAt(0) === "#" || t.charAt(0) === "!") continue;
    const name = t.replace(/\/+$/, "");
    if (!name || NON_NAME_CHARS.test(name)) continue;
    out.push(name);
  }
  return out;
}
function buildArtifactRootSegment(root, base, isWin) {
  const names = dirNamePatterns(base);
  if (!names.length || typeof root !== "string" || !root) return null;
  const parts = root.split(/[\\/]+/).filter((s) => s.length > 0);
  const segs = isWin && /^[a-zA-Z]:$/.test(parts[0] || "") ? parts.slice(1) : parts;
  const pool = isWin ? names.map((n) => n.toLowerCase()) : names;
  for (const seg of segs) {
    const i = pool.indexOf(isWin ? seg.toLowerCase() : seg);
    if (i >= 0) return names[i];
  }
  return null;
}
function buildRootNotice(segment) {
  return "\u5F53\u524D\u5DE5\u4F5C\u533A\u4F4D\u4E8E\u6784\u5EFA\u4EA7\u7269\u76EE\u5F55\uFF08\u8DEF\u5F84\u6BB5 " + segment + "\uFF09\uFF0C\u5DF2\u8DF3\u8FC7\u9879\u76EE\u5FEB\u7167\uFF1B\u5982\u9700\u5728\u6B64\u76EE\u5F55\u4F7F\u7528\u64A4\u56DE\uFF0C\u8BF7\u5728\u63D2\u4EF6\u8BBE\u7F6E\u91CC\u4ECE\u300C\u57FA\u7840\u6392\u9664\u8868\u300D\u79FB\u9664\u8BE5\u9879\u3002";
}
export {
  buildArtifactRootSegment,
  buildRootNotice,
  dirNamePatterns
};
