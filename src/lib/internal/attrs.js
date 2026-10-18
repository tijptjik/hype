/** @template {string} Part
 * @typedef {{ component: string, parts: Part[], getVariant?: () => string | null | undefined }} BitsAttrsConfig */

/** @param {unknown} condition Truthy state. @returns The corresponding attribute value. */
export function boolToStr(condition) {
  return condition ? 'true' : 'false'
}
/** @param {unknown} condition Truthy state. @returns The corresponding attribute value. */
export function boolToStrTrueOrUndef(condition) {
  return condition ? 'true' : undefined
}
/** @param {unknown} condition Truthy state. @returns The corresponding attribute value. */
export function boolToEmptyStrOrUndef(condition) {
  return condition ? '' : undefined
}
/** @param {unknown} condition Truthy state. @returns The corresponding attribute value. */
export function boolToTrueOrUndef(condition) {
  return condition ? true : undefined
}
/** @param {unknown} condition Truthy state. @returns The corresponding attribute value. */
export function getDataOpenClosed(condition) {
  return condition ? 'open' : 'closed'
}
/** @param {unknown} condition Truthy state. @returns The corresponding attribute value. */
export function getDataChecked(condition) {
  return condition ? 'checked' : 'unchecked'
}
/** @param {unknown} checked Checked state. @param {unknown} indeterminate Mixed state. @returns The ARIA checked value. */
export function getAriaChecked(checked, indeterminate) {
  if (indeterminate) {
    return 'mixed'
  }
  return checked ? 'true' : 'false'
}
/** @template {string} Part */
export class BitsAttrs {
  #variant
  #prefix
  /** @type {Record<Part, string>} */
  attrs
  /** @param {BitsAttrsConfig<Part>} config Attribute namespace and parts. */
  constructor(config) {
    this.#variant = config.getVariant ? config.getVariant() : null
    this.#prefix = this.#variant
      ? `data-${this.#variant}-`
      : `data-${config.component}-`
    this.getAttr = this.getAttr.bind(this)
    this.selector = this.selector.bind(this)
    this.attrs = /** @type {Record<Part, string>} */ (
      Object.fromEntries(config.parts.map(part => [part, this.getAttr(part)]))
    )
  }
  /** @param {string} part Part name. @param {string} [variantOverride] Namespace override. @returns {string} Attribute name. */
  getAttr(part, variantOverride) {
    if (variantOverride) return `data-${variantOverride}-${part}`
    return `${this.#prefix}${part}`
  }
  /** @param {string} part Part name. @param {string} [variantOverride] Namespace override. @returns {string} CSS selector. */
  selector(part, variantOverride) {
    return `[${this.getAttr(part, variantOverride)}]`
  }
}
/** @template {string} Part
 * @param {BitsAttrsConfig<Part>} config Attribute namespace and parts. @returns Attribute names and selector helpers. */
export function createBitsAttrs(config) {
  const bitsAttrs = new BitsAttrs(config)
  return {
    ...bitsAttrs.attrs,
    selector: bitsAttrs.selector,
    getAttr: bitsAttrs.getAttr,
  }
}
