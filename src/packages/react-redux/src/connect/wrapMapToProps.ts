import { ActionCreatorsMapObject, Dispatch, ActionCreator } from 'redux'

import { FixTypeLater } from '../types'
import verifyPlainObject from '../utils/verifyPlainObject'

type AnyState = { [key: string]: any }
type StateOrDispatch<S = AnyState> = S | Dispatch

type AnyProps = { [key: string]: any }

export type MapToProps<P = AnyProps> = {
  // eslint-disable-next-line no-unused-vars
  (stateOrDispatch: StateOrDispatch, ownProps?: P): FixTypeLater
  dependsOnOwnProps?: boolean
}

export function wrapMapToPropsConstant(
  // * Note:
  //  It seems that the dispatch argument
  //  could be a dispatch function in some cases (ex: whenMapDispatchToPropsIsMissing)
  //  and a state object in some others (ex: whenMapStateToPropsIsMissing)
  getConstant: (dispatch: Dispatch) =>
    | {
        dispatch?: Dispatch
        dependsOnOwnProps?: boolean
      }
    | ActionCreatorsMapObject
    | ActionCreator<any>
) {
  return function initConstantSelector(dispatch: Dispatch) {
    const constant = getConstant(dispatch)

    function constantSelector() {
      return constant
    }
    // 没有依赖ownProps
    constantSelector.dependsOnOwnProps = false
    return constantSelector
  }
}

// dependsOnOwnProps is used by createMapToPropsProxy to determine whether to pass props as args
// to the mapToProps function being wrapped. It is also used by makePurePropsSelector to determine
// whether mapToProps needs to be invoked when props have changed.
//
// A length of one signals that mapToProps does not depend on props from the parent component.
// A length of zero is assumed to mean mapToProps is getting args via arguments or ...args and
// therefore not reporting its length accurately..
// TODO Can this get pulled out so that we can subscribe directly to the store if we don't need ownProps?
/**
 * @description: 当mapToProps有dependsOnOwnProps属性时返回mapToProps.dependsOnOwnProps。
 * 否则判断函数参数个数为是否为1，是的话返回true，否则false
 * 
 * 
 * dependsOnOwnProps用于:
 * 
 * 1.initProxySelector中的proxy来决定是否需要传props给mapToProps
 * 
 * 2.用于在pureFinalPropsSelectorFactory中的handleNewPropsAndNewState、handleNewProps来判断
 * 是否需要触发mapStateToProps或mapDispatchToProps
 */
export function getDependsOnOwnProps(mapToProps: MapToProps) {
  return mapToProps.dependsOnOwnProps
    ? Boolean(mapToProps.dependsOnOwnProps)
    : mapToProps.length !== 1
}

// Used by whenMapStateToPropsIsFunction and whenMapDispatchToPropsIsFunction,
// this function wraps mapToProps in a proxy function which does several things:
//
//  * Detects whether the mapToProps function being called depends on props, which
//    is used by selectorFactory to decide if it should reinvoke on props changes.
//
//  * On first call, handles mapToProps if returns another function, and treats that
//    new function as the true mapToProps for subsequent calls.
//
//  * On first call, verifies the first result is a plain object, in order to warn
//    the developer that their mapToProps function is not returning a valid result.
//
/**
 * @description: 包装mapToProps
 * @param {MapToProps} mapToProps 真正的mapToProps：初始传入的mapStateToProps或mapDispatchToProps
 * @return {*} initProxySelector，该函数运行后会返回一个proxy = function mapToPropsProxy(
 * stateOrDispatch: StateOrDispatch,
 * ownProps?: P
 * ): MapToProps
 */
export function wrapMapToPropsFunc<P = AnyProps>(
  mapToProps: MapToProps,
  methodName: string
) {
  return function initProxySelector(
    dispatch: Dispatch,
    { displayName }: { displayName: string }
  ) {
    /** 
     * 代理mapToProps
     * dependsOnOwnProps表示是否依赖onwProps，如mapStateToProps(state, ownProops), 
     * mapDispatchToProps(dispatch, ownProops)，不依赖就不传,
     * 所以下面的第一个参数才叫stateOrDispatch，mapToProps有可能是mapStateToProps或mapDispatchToProps
     * */
    const proxy = function mapToPropsProxy(
      stateOrDispatch: StateOrDispatch,
      ownProps?: P
    ): MapToProps {
      return proxy.mapToProps(
        stateOrDispatch,
        proxy.dependsOnOwnProps ? ownProps : undefined
      )
    }

    // allow detectFactoryAndVerify to get ownProps
    // 这里设为true，首次执行proxy中的mapToProps实际是detectFactoryAndVerify,
    // 那么detectFactoryAndVerify就会接收到ownProps
    proxy.dependsOnOwnProps = true

    proxy.mapToProps = function detectFactoryAndVerify(
      stateOrDispatch: StateOrDispatch,
      ownProps?: P
    ): MapToProps {
      // 到了这里才替换真正的mapToProps，保证之后执行mapToProps不是detectFactoryAndVerify
      proxy.mapToProps = mapToProps
      // 当mapToProps有dependsOnOwnProps属性时返回mapToProps.dependsOnOwnProps。
      // 如果没有， 若函数参数个数为1返回false,否则返回true
      proxy.dependsOnOwnProps = getDependsOnOwnProps(mapToProps)
      /**
       * mapToProps有可能是工厂函数：运行后又返回了一个函数，所以下面会判断if (typeof props === 'function')
       * @example 
       * function mapStateToPropsFactory(initialState, ownProps) {
       *  // a closure for ownProps is created
       *  // this factory is not invoked everytime the component
       *  // changes it's props
       *  return function mapStateToProps(state) {
       *     return {
       *       blogs: state.blogs.filter(blog => blog.author === ownProps.user)
       *     };
       *  };
       * }
       * 
       * export default connect(mapStateToPropsFactory)(MyBlogs);
       */
      let props = proxy(stateOrDispatch, ownProps)

      if (typeof props === 'function') {
        proxy.mapToProps = props
        proxy.dependsOnOwnProps = getDependsOnOwnProps(props)
        props = proxy(stateOrDispatch, ownProps)
      }

      if (process.env.NODE_ENV !== 'production')
        verifyPlainObject(props, displayName, methodName)

      return props
    }
    return proxy
  }
}
