const rules: (blockClass: string) => string[] = (blockClass: string) => [
  `iframe, .${blockClass} { 
    background: repeating-linear-gradient(
      45deg,
      rgb(249, 249, 249),
      rgb(249, 249, 249) 10px,
      rgb(240, 240, 240) 10px,
      rgb(240, 240, 240) 20px
    ); 
    border-radius: 5px; 
  }`,
  'noscript { display: none !important; }',
];

export default rules;
