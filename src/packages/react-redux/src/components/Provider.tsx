import  { Context, ReactNode, useMemo } from 'react'
import { ReactReduxContext, ReactReduxContextValue } from './Context'
import { createSubscription } from '../utils/Subscription'
import { useIsomorphicLayoutEffect } from '../utils/useIsomorphicLayoutEffect'
import type { FixTypeLater } from '../types'
import { Action, AnyAction, Store } from 'redux'

export interface ProviderProps<A extends Action = AnyAction> {
  /**
   * The single Redux store in your application.
   */
  store: Store<FixTypeLater, A>
  /**
   * Optional context to be used internally in react-redux. Use React.createContext() to create a context to be used.
   * If this is used, you'll need to customize `connect` by supplying the same context provided to the Provider.
   * Initial value doesn't matter, as it is overwritten with the internal state of Provider.
   */
  context?: Context<ReactReduxContextValue>
  children: ReactNode
}

function Provider({ store, context, children }: ProviderProps) {
  // 大部分情况下contextValue是不会变的，因为大部分情况下store不会变，触发在render的时候传入store
  const contextValue = useMemo(() => {
    const subscription = createSubscription(store)
    return {
      store,
      subscription,
    }
  }, [store])

  const previousState = useMemo(() => store.getState(), [store])
  useIsomorphicLayoutEffect(() => {
    const { subscription } = contextValue
    subscription.onStateChange = subscription.notifyNestedSubs
    // trySubscribe会将onStateChange，实际上是notifyNestedSubs放入store的listener，
    // 那么store改变就会通知listener，那么notifyNestedSubs就会执行了
    subscription.trySubscribe()
    if (previousState !== store.getState()) {
      // 前后state不同的话就通知嵌套的订阅
      subscription.notifyNestedSubs()
    }
    return () => {
      subscription.tryUnsubscribe()
      subscription.onStateChange = undefined
    }
  }, [contextValue, previousState])

  const Context = context || ReactReduxContext

  return <Context.Provider value={contextValue}>{children}</Context.Provider>
}

export default Provider
