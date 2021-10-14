import { Dispatch } from 'redux'
import verifyPlainObject from '../utils/verifyPlainObject'

type MergeProps<TStateProps, TDispatchProps, TOwnProps, TMergedProps> = (
  stateProps: TStateProps,
  dispatchProps: TDispatchProps,
  ownProps: TOwnProps
) => TMergedProps
/** 
 * @example
 * return { ...ownProps, ...stateProps, ...dispatchProps } 
 * */
export function defaultMergeProps<TStateProps, TDispatchProps, TOwnProps>(
  stateProps: TStateProps,
  dispatchProps: TDispatchProps,
  ownProps: TOwnProps
) {
  return { ...ownProps, ...stateProps, ...dispatchProps }
}

interface InitMergeOptions {
  displayName: string
  areMergedPropsEqual: (a: any, b: any) => boolean
}

export function wrapMergePropsFunc<
  TStateProps,
  TDispatchProps,
  TOwnProps,
  TMergedProps
>(
  mergeProps: MergeProps<TStateProps, TDispatchProps, TOwnProps, TMergedProps>
): (
  dispatch: Dispatch,
  options: InitMergeOptions
) => MergeProps<TStateProps, TDispatchProps, TOwnProps, TMergedProps> {
  return function initMergePropsProxy(
    dispatch,
    { displayName, areMergedPropsEqual  }
  ) {
    let hasRunOnce = false
    let mergedProps: TMergedProps

    return function mergePropsProxy(
      stateProps: TStateProps,
      dispatchProps: TDispatchProps,
      ownProps: TOwnProps
    ) {
      const nextMergedProps = mergeProps(stateProps, dispatchProps, ownProps)

      if (hasRunOnce) {
        // 如果已经运行过一次，那么判断新得到的mergedProps是否和上次相同，不同更新mergedProps为nextMergedProps
        // 相同不更新，保持之前的引用
        if (!areMergedPropsEqual(nextMergedProps, mergedProps))
          mergedProps = nextMergedProps
      } else {
        // 这里是第一次运行
        hasRunOnce = true
        // 第一次得到的mergedProps
        mergedProps = nextMergedProps

        if (process.env.NODE_ENV !== 'production')
          verifyPlainObject(mergedProps, displayName, 'mergeProps')
      }

      return mergedProps
    }
  }
}

export function whenMergePropsIsFunction<
  TStateProps,
  TDispatchProps,
  TOwnProps,
  TMergedProps
>(
  mergeProps: MergeProps<TStateProps, TDispatchProps, TOwnProps, TMergedProps>
) {
  return typeof mergeProps === 'function'
    ? wrapMergePropsFunc(mergeProps)
    : undefined
}
/**
 * 没有传mergeProps的话，那么返回
 * @example
 * () => defaultMergeProps
 */
export function whenMergePropsIsOmitted<
  TStateProps,
  TDispatchProps,
  TOwnProps,
  TMergedProps
>(
  mergeProps?: MergeProps<TStateProps, TDispatchProps, TOwnProps, TMergedProps>
) {
  return !mergeProps ? () => defaultMergeProps : undefined
}

export default [whenMergePropsIsFunction, whenMergePropsIsOmitted] as const
