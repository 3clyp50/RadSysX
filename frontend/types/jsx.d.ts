import { LucideProps } from 'lucide-react';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      div: React.DetailedHTMLProps<React.HTMLAttributes<HTMLDivElement>, HTMLDivElement>;
      button: React.DetailedHTMLProps<React.ButtonHTMLAttributes<HTMLButtonElement>, HTMLButtonElement>;
      p: React.DetailedHTMLProps<React.HTMLAttributes<HTMLParagraphElement>, HTMLParagraphElement>;
      style: React.DetailedHTMLProps<React.StyleHTMLAttributes<HTMLStyleElement>, HTMLStyleElement>;
    }
  }
}

// Extend LucideProps to include className
declare module 'lucide-react' {
  interface LucideProps {
    className?: string;
    size?: number;
  }
} 