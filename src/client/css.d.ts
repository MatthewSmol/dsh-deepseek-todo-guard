/** Импорт CSS строкой для встраивания в бандл (`?inline`). */
declare module '*.css?inline' {
  const css: string
  export default css
}
