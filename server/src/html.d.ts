// .html files are bundled as their text (build.mjs: loader '.html': 'text').
declare module '*.html' {
  const text: string;
  export default text;
}
