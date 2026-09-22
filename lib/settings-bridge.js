import { Config, LEGACY_SETTINGS_NS, isLegacySettingsFace, resolveSettingsNs, unwrapConfig } from "./config.js";
function newSettingsNs(ctx, settings) {
  if (!settings) return null;
  if (isLegacySettingsFace(settings)) return null;
  if (typeof settings.describe !== "function" || typeof settings.update !== "function") return null;
  try {
    return resolveSettingsNs(ctx, settings);
  } catch (error) {
    return null;
  }
}
function installSettingsNamespace(deps) {
  const { ctx, dshSettings, config, settingsHooks, applyResolvedConfig, recordError } = deps;
  try {
    const legacyEntry = unwrapConfig(config);
    if (typeof dshSettings.installSettingsSection === "function") {
      dshSettings.installSettingsSection(ctx, LEGACY_SETTINGS_NS, Config, legacyEntry, settingsHooks);
    } else if (typeof ctx.inject === "function") {
      ctx.inject(["settings"], (settingsCtx) => {
        const settingsService = settingsCtx.settings;
        if (newSettingsNs(ctx, settingsService)) {
          ctx.on("loader/volatile-update", () => applyResolvedConfig(config));
        } else if (typeof settingsService.installSection === "function") {
          settingsService.installSection(ctx, LEGACY_SETTINGS_NS, Config, legacyEntry, settingsHooks);
        } else if (typeof settingsService.register === "function") {
          const scope = settingsService.register(LEGACY_SETTINGS_NS, Config, { base: legacyEntry });
          settingsHooks.setSource(() => scope.get());
          settingsHooks.onChange();
          scope.watch(() => settingsHooks.onChange());
          settingsCtx.effect(() => () => {
            settingsHooks.setSource(() => legacyEntry);
            settingsHooks.onChange();
          });
        }
      });
    }
  } catch (error) {
    recordError("recall settings namespace skipped: " + String(error));
  }
}
export {
  installSettingsNamespace
};
