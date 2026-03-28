// @ts-check

/**
 * @param {string} template
 * @param {Record<string, string | number> | undefined} params
 */
export function formatMessage(template, params) {
  if (!params) {
    return template;
  }

  return String(template).replace(/\{(\w+)\}/g, (fullMatch, paramKey) => {
    return Object.prototype.hasOwnProperty.call(params, paramKey)
      ? String(params[paramKey])
      : fullMatch;
  });
}

/**
 * @param {string} extensionId Manifest `id` (e.g. sigma.hello-world)
 * @param {Record<string, string>} messages English fallbacks keyed like locale JSON
 * @returns {(key: string, params?: Record<string, string | number>) => string}
 */
export function createExtensionTranslator(extensionId, messages) {
  const fallbackPrefix = `extensions.${extensionId}.`;
  return function translate(key, params) {
    const translated = sigma.i18n.extensionT(key, params);
    return translated === `${fallbackPrefix}${key}`
      ? formatMessage(messages[key] ?? key, params)
      : translated;
  };
}
