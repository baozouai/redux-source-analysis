import { useContext } from 'react'
import { ReactReduxContext } from '../components/Context'
import { useReduxContext as useDefaultReduxContext } from './useReduxContext'

/**
 * @description useStore的工厂函数
 * 
 * Hook factory, which creates a `useStore` hook bound to a given context.
 *
 * @param {React.Context} [context=ReactReduxContext] Context passed to your `<Provider>`.
 * @returns {Function} A `useStore` hook bound to the specified context.
 */
export function createStoreHook(context = ReactReduxContext) {
  // 如果是内置的context，则使用useDefaultReduxContext，否则用传入的context
  const useReduxContext =
    context === ReactReduxContext
      ? useDefaultReduxContext
      : () => useContext(context)
  return function useStore() {
    // 实际上就是返回context上的store
    const { store } = useReduxContext()!
    return store
  }
}

/**
 * @description 用的是内置的context，即 `ReactReduxContext`
 * 
 * A hook to access the redux store.
 *
 * @returns {any} the redux store
 *
 * @example
 *
 * import React from 'react'
 * import { useStore } from 'react-redux'
 *
 * export const ExampleComponent = () => {
 *   const store = useStore()
 *   return <div>{store.getState()}</div>
 * }
 */
export const useStore = /*#__PURE__*/ createStoreHook()
