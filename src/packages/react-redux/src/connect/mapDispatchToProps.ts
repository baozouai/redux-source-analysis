import { ActionCreatorsMapObject, Dispatch } from 'redux'
import { FixTypeLater } from '../types'
import bindActionCreators from '../utils/bindActionCreators'
import { wrapMapToPropsConstant, wrapMapToPropsFunc } from './wrapMapToProps'

export function whenMapDispatchToPropsIsFunction(
  mapDispatchToProps: ActionCreatorsMapObject | FixTypeLater
) {
  /** 
   * 传入mapDispatchToProps为函数的情况，那么做一层代理
   */
  return typeof mapDispatchToProps === 'function'
    ? wrapMapToPropsFunc(mapDispatchToProps, 'mapDispatchToProps')
    : undefined
}

export function whenMapDispatchToPropsIsMissing(mapDispatchToProps: undefined) {
  /** 
   * 没有传入mapDispatchToProps，那么返回dispatch
   */
  return !mapDispatchToProps
    ? wrapMapToPropsConstant((dispatch: Dispatch) => ({
        dispatch,
      }))
    : undefined
}

export function whenMapDispatchToPropsIsObject(
  mapDispatchToProps: ActionCreatorsMapObject
) {
  /**
   * 如果直接传入对象，该对象要求每个key都为函数，最终会返回
   * {
   *  newFn1: (...args) => dispatch(originFn1(...args)),
   *  newFn2: (...args) => dispatch(originFn2(...args)),
   *  ...
   * }
   */
  return mapDispatchToProps && typeof mapDispatchToProps === 'object'
    ? wrapMapToPropsConstant((dispatch: Dispatch) =>
        bindActionCreators(mapDispatchToProps, dispatch)
      )
    : undefined
}

export default [
  whenMapDispatchToPropsIsFunction,
  whenMapDispatchToPropsIsMissing,
  whenMapDispatchToPropsIsObject,
]
