import React from 'react'
import { Action, AnyAction, Store } from 'redux'
import type { Subscription } from '../utils/Subscription'

export interface ReactReduxContextValue<
  SS = any,
  A extends Action = AnyAction
> {
  store: Store<SS, A>
  subscription: Subscription
}

export const ReactReduxContext =
  /*#__PURE__*/ React.createContext<ReactReduxContextValue>(null as any)

export type ReactReduxContextInstance = typeof ReactReduxContext

if (process.env.NODE_ENV !== 'production') {
  ReactReduxContext.displayName = 'ReactRedux'
}

export default ReactReduxContext
