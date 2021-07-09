const rules: (blockClass: string) => string[] = (blockClass: string) => [
  `.${blockClass} { background: #ccc }`,
  'noscript { display: none !important; }',
  `.${blockClass} { background: black; border-radius: 5px; }`,
  `.${blockClass}:hover::after {content: 'Redacted'; color: white; text-align: center; width: 100%; display: block;}`,
];

export default rules;
