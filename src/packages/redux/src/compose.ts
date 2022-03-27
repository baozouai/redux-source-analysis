type Func<T extends any[], R> = (...a: T) => R

/**
 * Composes single-argument functions from right to left. The rightmost
 * function can take multiple arguments as it provides the signature for the
 * resulting composite function.
 *
 * @param funcs The functions to compose.
 * @returns A function obtained by composing the argument functions from right
 *   to left. For example, `compose(f, g, h)` is identical to doing
 *   `(...args) => f(g(h(...args)))`.
 */
export default function compose(): <R>(a: R) => R

export default function compose<F extends Function>(f: F): F

/* two functions */
export default function compose<A, T extends any[], R>(
  f1: (a: A) => R,
  f2: Func<T, A>
): Func<T, R>

/* three functions */
export default function compose<A, B, T extends any[], R>(
  f1: (b: B) => R,
  f2: (a: A) => B,
  f3: Func<T, A>
): Func<T, R>

/* four functions */
export default function compose<A, B, C, T extends any[], R>(
  f1: (c: C) => R,
  f2: (b: B) => C,
  f3: (a: A) => B,
  f4: Func<T, A>
): Func<T, R>

/* rest */
export default function compose<R>(
  f1: (a: any) => R,
  ...funcs: Function[]
): (...args: any[]) => R

export default function compose<R>(...funcs: Function[]): (...args: any[]) => R

export default function compose(...funcs: Function[]) {
  if (funcs.length === 0) {
    // infer the argument type so it is usable in inference down the line
    return <T>(arg: T) => arg
  }

  if (funcs.length === 1) {
    return funcs[0]
  }
  /**
   * @example
   * function add1(num) {
   *   console.log(num)
   *   return num + 1
   * }
   * function add2(num) {
   *   console.log(num)
   *   return num + 2
   * }
   * function add3(num) {
   *   console.log(num)
   *   return num + 3
   * }
   * [add1, add2, add3].reduce((a, b) =>
   *   (...args) => a(b(...args))
   * ))
   * 其中[add1, add2].reduce(...) => (...arg) => add1(add2(...arg))
   * 再加上add3，add3作为上面的...arg得到 (...args) => add1(add2(add3(...args)))
   * 
   * 这样就实现了后添加的middleware最新执行，然后把结果传给前一个middleware
   */
  return funcs.reduce(
    (a, b) =>
      (...args: any) =>
        a(b(...args))
  )
}
