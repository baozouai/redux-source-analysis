import {
  MapToProps,
  wrapMapToPropsConstant,
  wrapMapToPropsFunc,
} from './wrapMapToProps'

export function whenMapStateToPropsIsFunction(mapStateToProps?: MapToProps) {
  return typeof mapStateToProps === 'function'
    ? wrapMapToPropsFunc(mapStateToProps, 'mapStateToProps')
    : undefined
}

export function whenMapStateToPropsIsMissing(mapStateToProps?: MapToProps) {
  // mapStateToProps为空那么会返回空对象{}
  return !mapStateToProps ? wrapMapToPropsConstant(() => ({})) : undefined
}

export default [whenMapStateToPropsIsFunction, whenMapStateToPropsIsMissing]
