const rules: (blockClass: string) => string[] = (blockClass: string) => [
  `.${blockClass} { background: currentColor }`,
  'noscript { display: none !important; }',
  `.${blockClass} { background: currentColor; border-radius: 5px; }`,
  `.${blockClass}:hover::after {content: 'Redacted'; color: white; background: black; text-align: center; width: 100%; display: block;}`,
];

export default rules;
