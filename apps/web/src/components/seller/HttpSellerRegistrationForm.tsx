import { FormInput, FormSelect, FormStatus } from '../system/FormField.js';
import type { HttpSellerRegistrationState } from '../../hooks/useHttpSellerRegistration.js';

type HttpSellerRegistrationFormProps = {
  state: HttpSellerRegistrationState;
};

export function HttpSellerRegistrationForm({ state }: HttpSellerRegistrationFormProps) {
  const {
    session,
    name,
    setName,
    endpoint,
    setEndpoint,
    agentFramework,
    setAgentFramework,
    modelProvider,
    setModelProvider,
    modelId,
    setModelId,
    pricePerTaskUsd,
    setPricePerTaskUsd,
    authToken,
    setAuthToken,
    payoutWallet,
    setPayoutWallet,
    agentFrameworkOptions,
  } = state;

  return (
    <div className="form-grid">
      <FormInput
        label="offer name"
        onChange={(event) => setName(event.target.value)}
        value={name}
      />
      <FormInput
        label="endpoint url"
        onChange={(event) => setEndpoint(event.target.value)}
        placeholder="https://seller.example.com/bossraid"
        value={endpoint}
      />
      <FormSelect
        label="agent framework"
        onChange={(event) => setAgentFramework(event.target.value)}
        options={[...agentFrameworkOptions]}
        value={agentFramework}
      />
      <FormInput
        label="model provider"
        onChange={(event) => setModelProvider(event.target.value)}
        placeholder="openai"
        value={modelProvider}
      />
      <FormInput
        label="model id"
        onChange={(event) => setModelId(event.target.value)}
        placeholder="gpt-5.5"
        value={modelId}
      />
      <FormInput
        inputMode="decimal"
        label="price per task usd"
        onChange={(event) => setPricePerTaskUsd(event.target.value)}
        value={pricePerTaskUsd}
      />
      <FormInput
        label="payout wallet"
        onChange={(event) => setPayoutWallet(event.target.value)}
        placeholder={session?.wallet ?? '0x...'}
        value={payoutWallet}
      />
      <FormInput
        autoComplete="off"
        label="ingress bearer token"
        onChange={(event) => setAuthToken(event.target.value)}
        placeholder="optional"
        spellCheck={false}
        type="password"
        value={authToken}
      />
    </div>
  );
}

type HttpSellerRegisterSectionProps = {
  state: Pick<
    HttpSellerRegistrationState,
    'isAuthenticated' | 'pending' | 'error' | 'status' | 'handleRegister'
  >;
};

export function HttpSellerRegisterSection({ state }: HttpSellerRegisterSectionProps) {
  const { isAuthenticated, pending, error, status, handleRegister } = state;

  return (
    <>
      <button
        className="button button--primary"
        disabled={!isAuthenticated || pending}
        onClick={() => void handleRegister()}
        type="button"
      >
        {pending ? 'registering...' : 'register worker'}
      </button>
      {error ? <FormStatus tone="error">{error}</FormStatus> : null}
      {status ? <FormStatus>{status}</FormStatus> : null}
    </>
  );
}
