import assert from 'node:assert/strict';
import test from 'node:test';
import { isRobinhoodPaymentNetwork } from '@bossraid/constants';
import { readX402Config } from '../x402-config.js';
import { isRobinhoodUsdGRail } from './x402-runtime.js';

test('Robinhood payment networks use exact IDs; production rail excludes testnet', () => {
  for (const network of ['eip155:4663', 'eip155:46630']) {
    assert.equal(isRobinhoodPaymentNetwork(network), true);
    assert.equal(
      isRobinhoodUsdGRail(readX402Config({ BOSSRAID_X402_NETWORK: network })),
      network === 'eip155:4663'
    );
  }
  for (const network of ['eip155:46631', 'eip155:4663junk', 'eip155:466300']) {
    assert.equal(isRobinhoodPaymentNetwork(network), false);
    assert.throws(
      () => readX402Config({ BOSSRAID_X402_ENABLED: 'true', BOSSRAID_X402_NETWORK: network }),
      /network must be Robinhood/
    );
  }
});
