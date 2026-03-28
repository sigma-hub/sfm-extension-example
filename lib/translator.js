// @ts-check

import { extensionMessages } from '../messages.js';
import { createExtensionTranslator } from './i18n.js';

export const t = createExtensionTranslator('sigma.hello-world', extensionMessages);
