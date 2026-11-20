import { Children, isValidElement, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { LINK } from '../../components/TextLink';

/** The text of a heading, as written, to make its anchor. */
function textOf(children: ReactNode): string {
  return Children.toArray(children)
    .map((child) =>
      typeof child === 'string' || typeof child === 'number'
        ? String(child)
        : isValidElement<{ children?: ReactNode }>(child)
          ? textOf(child.props.children)
          : '',
    )
    .join('');
}

/**
 * The anchor of a heading, as GitHub makes it, so the guide's own table of
 * contents (written for GitHub) also works here: lower case, punctuation out,
 * spaces as hyphens, accented letters kept.
 */
export function anchorOf(text: string): string {
  return text
    .trim()
    .toLocaleLowerCase('pt-BR')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s/g, '-');
}

/** Links to the other documents of the repository have no page here: they stay as text. */
function GuideLink({ href, children }: { href?: string | undefined; children?: ReactNode }) {
  if (href?.startsWith('#')) {
    return (
      <a href={href} className={LINK}>
        {children}
      </a>
    );
  }
  if (href && /^https?:\/\//.test(href)) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={LINK}>
        {children}
      </a>
    );
  }
  return <span className="font-semibold">{children}</span>;
}

// The page title is "Ajuda" (h1): the guide's headings go one level down.
const COMPONENTS: Components = {
  h1: ({ children }) => (
    <h2 id={anchorOf(textOf(children))} className="mb-3 text-2xl font-bold">
      {children}
    </h2>
  ),
  h2: ({ children }) => (
    <h3
      id={anchorOf(textOf(children))}
      className="mt-10 mb-3 scroll-mt-4 border-t border-line pt-6 text-xl font-bold"
    >
      {children}
    </h3>
  ),
  h3: ({ children }) => (
    <h4 id={anchorOf(textOf(children))} className="mt-6 mb-2 scroll-mt-4 text-lg font-semibold">
      {children}
    </h4>
  ),
  h4: ({ children }) => <h5 className="mt-4 mb-2 font-semibold">{children}</h5>,
  p: ({ children }) => <p className="my-3 leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="my-3 list-disc space-y-1.5 pl-6">{children}</ul>,
  ol: ({ children }) => <ol className="my-3 list-decimal space-y-1.5 pl-6">{children}</ol>,
  a: ({ href, children }) => <GuideLink href={href}>{children}</GuideLink>,
  // The guide shows no images: there is nothing to fetch from anywhere.
  img: ({ alt }) => <span className="text-dim">[imagem{alt ? `: ${alt}` : ''}]</span>,
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-2 border-line-strong pl-3 text-dim">{children}</blockquote>
  ),
  hr: () => <hr className="my-6 border-line" />,
  pre: ({ children }) => (
    <pre className="my-3 overflow-x-auto rounded-md border border-line bg-ink p-3 text-sm">
      {children}
    </pre>
  ),
  code: ({ children }) => <code className="rounded bg-ink px-1 py-0.5 font-mono">{children}</code>,
  table: ({ children }) => (
    // A wide table scrolls sideways: the box takes the keyboard focus so it can (WCAG 2.1.1).
    <div
      role="region"
      aria-label="Tabela do guia"
      tabIndex={0}
      className="my-4 overflow-x-auto rounded-lg border border-line"
    >
      <table className="w-full min-w-120 border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b border-line bg-sheet-raised px-3 py-2 text-left font-semibold">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-line px-3 py-2 align-top text-dim">{children}</td>
  ),
};

/**
 * The user guide (docs/GUIA.md) inside the platform (Phase 32, D4). It is our
 * own text, read when the interface is built, but it gets the same care as
 * any Markdown here: no raw HTML, no images.
 */
export function GuideDocument({ text }: { text: string }) {
  return (
    <article className="max-w-3xl break-words">
      <ReactMarkdown components={COMPONENTS} remarkPlugins={[remarkGfm]} skipHtml>
        {text}
      </ReactMarkdown>
    </article>
  );
}
