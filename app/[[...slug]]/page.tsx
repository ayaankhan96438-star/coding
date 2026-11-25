import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import LegacyPageClient from '@/components/legacy-page-client';
import { getLegacyPageData, getLegacyPageNames } from '@/lib/legacy-pages';

type PageProps = { params: Promise<{ slug?: string[] }> };
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/$/, '');

export const dynamicParams = false;

export function generateStaticParams() {
  return [
    { slug: [] },
    ...getLegacyPageNames().filter((fileName) => fileName !== 'index.html').map((fileName) => ({ slug: [fileName] })),
  ];
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = getLegacyPageData(slug);
  if (!page) return { title: 'Page not found | CodeBolt' };
  return {
    title: page.title,
    description: page.description,
  };
}

export default async function Page({ params }: PageProps) {
  const { slug } = await params;
  const page = getLegacyPageData(slug);
  if (!page) notFound();

  return (
    <>
      {page.styles.map((css, index) => (
        <style key={`legacy-head-style-${index}`} dangerouslySetInnerHTML={{ __html: css }} />
      ))}
      {page.links.map((link, index) => {
        const rel = link.rel || '';
        const href = link.href || '';
        const isStylesheet = rel.toLowerCase().split(/\s+/).includes('stylesheet');
        const isIcon = rel.toLowerCase().includes('icon');
        const isExternal = /^(?:[a-z]+:)?\/\//i.test(href) || href.startsWith('data:');
        const cleanHref = href.replace(/^\.\//, '').replace(/^\/+/, '');
        const normalizedHref = isExternal ? href : `${basePath}/${cleanHref}`;
        if (isStylesheet) {
          return <link key={`${href}-${index}`} rel="stylesheet" href={normalizedHref} precedence="default" />;
        }
        if (isIcon) {
          return <link key={`${href}-${index}`} rel={rel} href={normalizedHref} type={link.type} />;
        }
        if (rel.toLowerCase() === 'preconnect' || rel.toLowerCase() === 'dns-prefetch' || rel.toLowerCase() === 'preload') {
          return <link key={`${href}-${index}`} rel={rel} href={normalizedHref} as={link.as} type={link.type} crossOrigin={(link.crossorigin as 'anonymous' | 'use-credentials' | undefined)} />;
        }
        return null;
      })}
      <LegacyPageClient
        fileName={page.fileName}
        title={page.title}
        bodyAttributes={page.bodyAttributes}
        bodyHtml={page.bodyHtml}
        scripts={page.scripts}
      />
    </>
  );
}
