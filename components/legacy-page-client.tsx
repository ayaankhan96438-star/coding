'use client';

import { useEffect, useRef } from 'react';
import type { LegacyAttributeMap, LegacyScript } from '@/lib/legacy-pages';

type Props = {
  fileName: string;
  title: string;
  bodyAttributes: LegacyAttributeMap;
  bodyHtml: string;
  scripts: LegacyScript[];
};

function applyBodyAttributes(attributes: LegacyAttributeMap) {
  const keep = new Set(Object.keys(attributes));
  for (const attribute of [...document.body.attributes]) {
    if ((attribute.name.startsWith('data-') || attribute.name === 'class' || attribute.name === 'style') && !keep.has(attribute.name)) {
      document.body.removeAttribute(attribute.name);
    }
  }
  for (const [name, value] of Object.entries(attributes)) {
    if (name === 'class') document.body.className = value;
    else if (name === 'style') document.body.setAttribute(name, value);
    else document.body.setAttribute(name, value);
  }
}

function absoluteAssetUrl(source: string): string {
  if (/^(?:[a-z]+:)?\/\//i.test(source) || source.startsWith('data:') || source.startsWith('blob:')) return source;
  return new URL(source.replace(/^\.\//, ''), document.baseURI).toString();
}

function appendScript(definition: LegacyScript): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const { attributes, content } = definition;
    for (const [name, value] of Object.entries(attributes)) {
      if (name === 'src' || name === 'async' || name === 'defer') continue;
      script.setAttribute(name, value);
    }

    if (attributes.src) {
      script.src = absoluteAssetUrl(attributes.src);
      // Preserve source order even though dynamically inserted scripts default to async.
      script.async = false;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Could not load CodeBolt asset: ${attributes.src}`));
      document.body.appendChild(script);
      return;
    }

    script.textContent = content;
    document.body.appendChild(script);
    resolve();
  });
}

export default function LegacyPageClient({ fileName, title, bodyAttributes, bodyHtml, scripts }: Props) {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    document.title = title;
    applyBodyAttributes(bodyAttributes);
    document.body.dataset.nextPage = fileName;

    const runScriptsInSourceOrder = async () => {
      for (const script of scripts) {
        try {
          await appendScript(script);
        } catch (error) {
          console.error(error);
          document.body.dataset.legacyScriptsError = 'true';
          break;
        }
      }
    };

    void runScriptsInSourceOrder();
  }, [bodyAttributes, fileName, scripts, title]);

  return <div id="legacy-page-root" dangerouslySetInnerHTML={{ __html: bodyHtml }} />;
}
