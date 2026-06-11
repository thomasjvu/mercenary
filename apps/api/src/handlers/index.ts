import { type ApiContext } from '../api-context.js';
import { serializeProviderHealth, serializeProviderProfile } from '../lib/serializers.js';
import { createAuthHandlers } from './auth.js';
import { createManaBillingHandlers } from './billing-mana.js';
import { createPaymentHandlers } from './payment.js';
import { createRaidHandlers } from './raid.js';
import { createChatHandlers } from './chat.js';

export function createApiHandlers(ctx: ApiContext) {
  const auth = createAuthHandlers(ctx);
  const manaBilling = createManaBillingHandlers(ctx);
  const payment = createPaymentHandlers(ctx, auth, manaBilling);
  const raid = createRaidHandlers(ctx, auth, payment);
  const chat = createChatHandlers(ctx, auth, manaBilling, payment, raid);

  return {
    auth,
    manaBilling,
    payment,
    raid,
    chat,
    serializeProviderProfile,
    serializeProviderHealth,
  };
}

export type ApiHandlerGroups = ReturnType<typeof createApiHandlers>;
