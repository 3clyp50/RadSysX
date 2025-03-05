import React from 'react';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      // Add all HTML elements that might be used
      div: React.DetailedHTMLProps<React.HTMLAttributes<HTMLDivElement>, HTMLDivElement>;
      span: React.DetailedHTMLProps<React.HTMLAttributes<HTMLSpanElement>, HTMLSpanElement>;
      p: React.DetailedHTMLProps<React.HTMLAttributes<HTMLParagraphElement>, HTMLParagraphElement>;
      a: React.DetailedHTMLProps<React.AnchorHTMLAttributes<HTMLAnchorElement>, HTMLAnchorElement>;
      button: React.DetailedHTMLProps<React.ButtonHTMLAttributes<HTMLButtonElement>, HTMLButtonElement>;
      input: React.DetailedHTMLProps<React.InputHTMLAttributes<HTMLInputElement>, HTMLInputElement>;
      img: React.DetailedHTMLProps<React.ImgHTMLAttributes<HTMLImageElement>, HTMLImageElement>;
      h1: React.DetailedHTMLProps<React.HTMLAttributes<HTMLHeadingElement>, HTMLHeadingElement>;
      h2: React.DetailedHTMLProps<React.HTMLAttributes<HTMLHeadingElement>, HTMLHeadingElement>;
      h3: React.DetailedHTMLProps<React.HTMLAttributes<HTMLHeadingElement>, HTMLHeadingElement>;
      h4: React.DetailedHTMLProps<React.HTMLAttributes<HTMLHeadingElement>, HTMLHeadingElement>;
      h5: React.DetailedHTMLProps<React.HTMLAttributes<HTMLHeadingElement>, HTMLHeadingElement>;
      h6: React.DetailedHTMLProps<React.HTMLAttributes<HTMLHeadingElement>, HTMLHeadingElement>;
      br: React.DetailedHTMLProps<React.HTMLAttributes<HTMLBRElement>, HTMLBRElement>;
      hr: React.DetailedHTMLProps<React.HTMLAttributes<HTMLHRElement>, HTMLHRElement>;
      label: React.DetailedHTMLProps<React.LabelHTMLAttributes<HTMLLabelElement>, HTMLLabelElement>;
      select: React.DetailedHTMLProps<React.SelectHTMLAttributes<HTMLSelectElement>, HTMLSelectElement>;
      option: React.DetailedHTMLProps<React.OptionHTMLAttributes<HTMLOptionElement>, HTMLOptionElement>;
      ul: React.DetailedHTMLProps<React.HTMLAttributes<HTMLUListElement>, HTMLUListElement>;
      ol: React.DetailedHTMLProps<React.HTMLAttributes<HTMLOListElement>, HTMLOListElement>;
      li: React.DetailedHTMLProps<React.LiHTMLAttributes<HTMLLIElement>, HTMLLIElement>;
      table: React.DetailedHTMLProps<React.TableHTMLAttributes<HTMLTableElement>, HTMLTableElement>;
      tr: React.DetailedHTMLProps<React.HTMLAttributes<HTMLTableRowElement>, HTMLTableRowElement>;
      td: React.DetailedHTMLProps<React.TdHTMLAttributes<HTMLTableDataCellElement>, HTMLTableDataCellElement>;
      th: React.DetailedHTMLProps<React.ThHTMLAttributes<HTMLTableHeaderCellElement>, HTMLTableHeaderCellElement>;
      
      // SVG elements
      svg: React.SVGProps<SVGSVGElement>;
      path: React.SVGProps<SVGPathElement>;
      circle: React.SVGProps<SVGCircleElement>;
      rect: React.SVGProps<SVGRectElement>;
      line: React.SVGProps<SVGLineElement>;
      polyline: React.SVGProps<SVGPolylineElement>;
      polygon: React.SVGProps<SVGPolygonElement>;
      g: React.SVGProps<SVGGElement>;
      text: React.SVGProps<SVGTextElement>;
    }
  }
}

export {};

// Add SVG specific attributes that might be missing
declare namespace React {
  interface SVGProps<T> extends React.SVGAttributes<T> {
    xmlns?: string;
    className?: string;
    fill?: string;
    viewBox?: string;
    stroke?: string;
  }

  interface SVGAttributes<T> extends AriaAttributes, DOMAttributes<T> {
    // SVG Specific attributes
    strokeLinecap?: string;
    strokeLinejoin?: string;
    strokeWidth?: number | string;
    d?: string;

    // Add other common SVG attributes as needed
    accentHeight?: number | string;
    alignmentBaseline?: string;
    arabicForm?: string;
    baselineShift?: number | string;
    clipPath?: string;
    clipRule?: number | string;
    colorInterpolation?: number | string;
    colorInterpolationFilters?: string;
    colorProfile?: number | string;
    colorRendering?: number | string;
    dominantBaseline?: number | string;
    enableBackground?: number | string;
    fillOpacity?: number | string;
    fillRule?: string;
    floodColor?: number | string;
    floodOpacity?: number | string;
    fontFamily?: string;
    fontSize?: number | string;
    fontSizeAdjust?: number | string;
    fontStretch?: number | string;
    fontStyle?: number | string;
    fontVariant?: number | string;
    fontWeight?: number | string;
    glyphName?: number | string;
    glyphOrientationHorizontal?: number | string;
    glyphOrientationVertical?: number | string;
    horizAdvX?: number | string;
    horizOriginX?: number | string;
    imageRendering?: number | string;
    letterSpacing?: number | string;
    lightingColor?: number | string;
    markerEnd?: string;
    markerMid?: string;
    markerStart?: string;
    overlinePosition?: number | string;
    overlineThickness?: number | string;
    paintOrder?: number | string;
    pointerEvents?: number | string;
    renderingIntent?: number | string;
    shapeRendering?: number | string;
    stopColor?: string;
    stopOpacity?: number | string;
    strikethroughPosition?: number | string;
    strikethroughThickness?: number | string;
    strokeDasharray?: string | number;
    strokeDashoffset?: string | number;
    strokeMiterlimit?: number | string;
    strokeOpacity?: number | string;
    textAnchor?: string;
    textDecoration?: number | string;
    textRendering?: number | string;
    underlinePosition?: number | string;
    underlineThickness?: number | string;
    unicodeBidi?: number | string;
    unicodeRange?: number | string;
    wordSpacing?: number | string;
    writingMode?: number | string;
  }
} 