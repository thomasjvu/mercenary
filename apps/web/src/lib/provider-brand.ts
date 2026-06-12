export type ProviderBrand = {
  icon: string;
  label: string;
};

const PROVIDER_BRANDS: Record<string, ProviderBrand> = {
  openai: { icon: 'simple-icons:openai', label: 'OpenAI' },
  anthropic: { icon: 'simple-icons:anthropic', label: 'Anthropic' },
  google: { icon: 'simple-icons:google', label: 'Google' },
  meta: { icon: 'simple-icons:meta', label: 'Meta' },
  mistral: { icon: 'simple-icons:mistralai', label: 'Mistral' },
  mistralai: { icon: 'simple-icons:mistralai', label: 'Mistral' },
  cohere: { icon: 'simple-icons:cohere', label: 'Cohere' },
  venice: { icon: 'simple-icons:ethereum', label: 'Venice' },
  xai: { icon: 'simple-icons:x', label: 'xAI' },
  deepseek: { icon: 'simple-icons:deepseek', label: 'DeepSeek' },
  qwen: { icon: 'simple-icons:alibabacloud', label: 'Qwen' },
  groq: { icon: 'simple-icons:groq', label: 'Groq' },
};

const FALLBACK_BRAND: ProviderBrand = {
  icon: 'pixel:sparkles-solid',
  label: 'Provider',
};

export function resolveProviderBrand(modelProvider?: string | null): ProviderBrand {
  if (!modelProvider?.trim()) {
    return FALLBACK_BRAND;
  }

  const key = modelProvider
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  return PROVIDER_BRANDS[key] ?? { ...FALLBACK_BRAND, label: modelProvider.trim() };
}
