/**
 * @description: 是否是纯对象，即要求是传入参数是类似这样的 {a: 'xxx'}
 * @param obj The object to inspect.
 * @returns True if the argument appears to be a plain object.
 * 
 * @example
 * isPlainObject(Number) => false
 * isPlainObject({}) => true
 * isPlainObject({ a: 1 }) => true
 */
export default function isPlainObject(obj: any): boolean {
  // 不是对象，或者是null，那么不是纯对象
  if (typeof obj !== 'object' || obj === null) return false

  let proto = obj
  // 获取原型链到null的前一个，一般就是Object.prototype
  while (Object.getPrototypeOf(proto) !== null) {
    proto = Object.getPrototypeOf(proto)
  }

  return Object.getPrototypeOf(obj) === proto
}
