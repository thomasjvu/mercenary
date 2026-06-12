type MetaAttribute = 'name' | 'property';

function upsertMetaTag(attribute: MetaAttribute, key: string, content: string): void {
  const selector = `meta[${attribute}="${key}"]`;
  let element = document.head.querySelector<HTMLMetaElement>(selector);

  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }

  element.setAttribute('content', content);
}

export function applyDocumentMeta(input: {
  title: string;
  description: string;
  ogTitle?: string;
  ogDescription?: string;
}): void {
  document.title = input.title;
  upsertMetaTag('name', 'description', input.description);
  upsertMetaTag('property', 'og:title', input.ogTitle ?? input.title);
  upsertMetaTag('property', 'og:description', input.ogDescription ?? input.description);
  upsertMetaTag('property', 'og:type', 'website');
}
