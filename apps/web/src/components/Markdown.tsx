import ReactMarkdown, { type Components } from 'react-markdown';

/**
 * Model output is untrusted (SECURITY C-07). It is rendered as Markdown with:
 * - no raw HTML: tags in the text are shown as text, never turned into elements;
 * - no images: a remote image would tell its host that the message was read;
 * - links that open in a new tab without handing over the opener or the referrer
 *   (`react-markdown` already drops dangerous schemes such as `javascript:`).
 * Everything is styled with classes, since the CSP forbids inline styles.
 */
const COMPONENTS: Components = {
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="text-info underline underline-offset-4"
    >
      {children}
    </a>
  ),
  img: ({ alt }) => <span className="text-dim">[imagem{alt ? `: ${alt}` : ''}]</span>,
  p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
  h1: ({ children }) => <p className="mb-2 mt-3 text-lg font-bold first:mt-0">{children}</p>,
  h2: ({ children }) => <p className="mb-2 mt-3 text-lg font-bold first:mt-0">{children}</p>,
  h3: ({ children }) => <p className="mb-1 mt-3 font-bold first:mt-0">{children}</p>,
  h4: ({ children }) => <p className="mb-1 mt-3 font-bold first:mt-0">{children}</p>,
  h5: ({ children }) => <p className="mb-1 mt-3 font-semibold first:mt-0">{children}</p>,
  h6: ({ children }) => <p className="mb-1 mt-3 font-semibold first:mt-0">{children}</p>,
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-line-strong pl-3 text-dim">{children}</blockquote>
  ),
  hr: () => <hr className="my-3 border-line" />,
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto rounded-md border border-line bg-ink p-3 text-sm">
      {children}
    </pre>
  ),
  code: ({ children }) => (
    <code className="rounded bg-ink px-1 py-0.5 font-mono text-[0.9em]">{children}</code>
  ),
};

export function Markdown({ text }: { text: string }) {
  return (
    <div className="min-w-0 break-words">
      <ReactMarkdown components={COMPONENTS}>{text}</ReactMarkdown>
    </div>
  );
}
