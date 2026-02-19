import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface AIMessageProps {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: Date;
}

export function AIMessage({ role, content, timestamp }: AIMessageProps) {
  return (
    <div
      className={cn(
        'flex w-full mb-4',
        role === 'user' ? 'justify-end' : 'justify-start'
      )}
    >
      <div
        className={cn(
          'max-w-[80%] rounded-lg px-4 py-2',
          role === 'user'
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-foreground'
        )}
      >
        <div className="text-sm prose prose-sm dark:prose-invert max-w-none">
          {role === 'user' ? (
            // User messages: keep as plain text (no markdown)
            <div className="whitespace-pre-wrap break-words">{content}</div>
          ) : (
            // Assistant messages: render markdown
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                // Style links
                a: ({ node, ...props }) => (
                  <a {...props} className="text-primary hover:underline" target="_blank" rel="noopener noreferrer" />
                ),
                // Style lists
                ul: ({ node, ...props }) => (
                  <ul {...props} className="list-disc list-inside mb-2 space-y-1" />
                ),
                ol: ({ node, ...props }) => (
                  <ol {...props} className="list-decimal list-inside mb-2 space-y-1" />
                ),
                // Style paragraphs
                p: ({ node, ...props }) => (
                  <p {...props} className="mb-2 last:mb-0" />
                ),
                // Style code blocks
                code: ({ node, inline, ...props }: any) => (
                  inline ? (
                    <code {...props} className="bg-muted/50 px-1 py-0.5 rounded text-xs" />
                  ) : (
                    <code {...props} className="block bg-muted/50 px-2 py-1 rounded text-xs overflow-x-auto" />
                  )
                ),
                // Style strong/bold
                strong: ({ node, ...props }) => (
                  <strong {...props} className="font-semibold" />
                ),
              }}
            >
              {content}
            </ReactMarkdown>
          )}
        </div>
        {timestamp && (
          <div className="text-xs opacity-70 mt-1">
            {timestamp.toLocaleTimeString()}
          </div>
        )}
      </div>
    </div>
  );
}
