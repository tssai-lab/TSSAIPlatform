import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './markdown-preview.css';

type Props = {
  content: string;
  maxHeight: string | number;
};

const MarkdownPreview: React.FC<Props> = ({ content, maxHeight }) => (
  <div className="dataset-markdown-preview" style={{ maxHeight }}>
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ children, ...props }) => (
          <a {...props} target="_blank" rel="noreferrer noopener">
            {children}
          </a>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  </div>
);

export default MarkdownPreview;
