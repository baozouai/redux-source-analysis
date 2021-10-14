/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 */

'use strict';

let useSyncExternalStore;
let useSyncExternalStoreExtra;
let React;
let ReactDOM;
let Scheduler;
let act;
let useState;
let useEffect;
let useLayoutEffect;

// This tests shared behavior between the built-in and shim implementations of
// of useSyncExternalStore.
describe('Shared useSyncExternalStore behavior (shim and built-in)', () => {
  beforeEach(() => {
    jest.resetModules();

    // Remove the built-in API from the React exports to force the package to
    // use the shim.
    if (!gate(flags => flags.supportsNativeUseSyncExternalStore)) {
      // and the non-variant tests for the shim.
      //
      // Remove useSyncExternalStore from the React imports so that we use the
      // shim instead. Also removing startTransition, since we use that to
      // detect outdated 18 alphas that don't yet include useSyncExternalStore.
      //
      // Longer term, we'll probably test this branch using an actual build
      // of React 17.
      jest.mock('react', () => {
        const {
          // eslint-disable-next-line no-unused-vars
          startTransition: _,
          // eslint-disable-next-line no-unused-vars
          useSyncExternalStore: __,
          // eslint-disable-next-line no-unused-vars
          unstable_useSyncExternalStore: ___,
          ...otherExports
        } = jest.requireActual('react');
        return otherExports;
      });
    }

    React = require('react');
    ReactDOM = require('react-dom');
    Scheduler = require('scheduler');
    useState = React.useState;
    useEffect = React.useEffect;
    useLayoutEffect = React.useLayoutEffect;

    const internalAct = require('jest-react').act;

    // The internal act implementation doesn't batch updates by default, since
    // it's mostly used to test concurrent mode. But since these tests run
    // in both concurrent and legacy mode, I'm adding batching here.
    act = cb => internalAct(() => ReactDOM.unstable_batchedUpdates(cb));

    useSyncExternalStore = require('use-sync-external-store')
      .useSyncExternalStore;
    useSyncExternalStoreExtra = require('use-sync-external-store/extra')
      .useSyncExternalStoreExtra;
  });

  function Text({text}) {
    Scheduler.unstable_yieldValue(text);
    return text;
  }

  function createRoot(container) {
    // This wrapper function exists so we can test both legacy roots and
    // concurrent roots.
    if (gate(flags => flags.supportsNativeUseSyncExternalStore)) {
      // The native implementation only exists in 18+, so we test using
      // concurrent mode. To test the legacy root behavior in the native
      // implementation (which is supported in the sense that it needs to have
      // the correct behavior, despite the fact that the legacy root API
      // triggers a warning in 18), write a test that uses
      // createLegacyRoot directly.
      return ReactDOM.createRoot(container);
    } else {
      ReactDOM.render(null, container);
      return {
        render(children) {
          ReactDOM.render(children, container);
        },
      };
    }
  }

  function createExternalStore(initialState) {
    const listeners = new Set();
    let currentState = initialState;
    return {
      set(text) {
        currentState = text;
        ReactDOM.unstable_batchedUpdates(() => {
          listeners.forEach(listener => listener());
        });
      },
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      getState() {
        return currentState;
      },
      getSubscriberCount() {
        return listeners.size;
      },
    };
  }

  test('basic usage', async () => {
    const store = createExternalStore('Initial');

    function App() {
      const text = useSyncExternalStore(store.subscribe, store.getState);
      return <Text text={text} />;
    }

    const container = document.createElement('div');
    const root = createRoot(container);
    await act(() => root.render(<App />));

    expect(Scheduler).toHaveYielded(['Initial']);
    expect(container.textContent).toEqual('Initial');

    await act(() => {
      store.set('Updated');
    });
    expect(Scheduler).toHaveYielded(['Updated']);
    expect(container.textContent).toEqual('Updated');
  });

  test('skips re-rendering if nothing changes', () => {
    const store = createExternalStore('Initial');

    function App() {
      const text = useSyncExternalStore(store.subscribe, store.getState);
      return <Text text={text} />;
    }

    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => root.render(<App />));

    expect(Scheduler).toHaveYielded(['Initial']);
    expect(container.textContent).toEqual('Initial');

    // Update to the same value
    act(() => {
      store.set('Initial');
    });
    // Should not re-render
    expect(Scheduler).toHaveYielded([]);
    expect(container.textContent).toEqual('Initial');
  });

  test('switch to a different store', async () => {
    const storeA = createExternalStore(0);
    const storeB = createExternalStore(0);

    let setStore;
    function App() {
      const [store, _setStore] = useState(storeA);
      setStore = _setStore;
      const value = useSyncExternalStore(store.subscribe, store.getState);
      return <Text text={value} />;
    }

    const container = document.createElement('div');
    const root = createRoot(container);
    await act(() => root.render(<App />));

    expect(Scheduler).toHaveYielded([0]);
    expect(container.textContent).toEqual('0');

    await act(() => {
      storeA.set(1);
    });
    expect(Scheduler).toHaveYielded([1]);
    expect(container.textContent).toEqual('1');

    // Switch stores and update in the same batch
    act(() => {
      ReactDOM.flushSync(() => {
        // This update will be disregarded
        storeA.set(2);
        setStore(storeB);
      });
    });
    // Now reading from B instead of A
    expect(Scheduler).toHaveYielded([0]);
    expect(container.textContent).toEqual('0');

    // Update A
    await act(() => {
      storeA.set(3);
    });
    // Nothing happened, because we're no longer subscribed to A
    expect(Scheduler).toHaveYielded([]);
    expect(container.textContent).toEqual('0');

    // Update B
    await act(() => {
      storeB.set(1);
    });
    expect(Scheduler).toHaveYielded([1]);
    expect(container.textContent).toEqual('1');
  });

  test('selecting a specific value inside getSnapshot', async () => {
    const store = createExternalStore({a: 0, b: 0});

    function A() {
      const a = useSyncExternalStore(store.subscribe, () => store.getState().a);
      return <Text text={'A' + a} />;
    }
    function B() {
      const b = useSyncExternalStore(store.subscribe, () => store.getState().b);
      return <Text text={'B' + b} />;
    }

    function App() {
      return (
        <>
          <A />
          <B />
        </>
      );
    }

    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => root.render(<App />));

    expect(Scheduler).toHaveYielded(['A0', 'B0']);
    expect(container.textContent).toEqual('A0B0');

    // Update b but not a
    await act(() => {
      store.set({a: 0, b: 1});
    });
    // Only b re-renders
    expect(Scheduler).toHaveYielded(['B1']);
    expect(container.textContent).toEqual('A0B1');

    // Update a but not b
    await act(() => {
      store.set({a: 1, b: 1});
    });
    // Only a re-renders
    expect(Scheduler).toHaveYielded(['A1']);
    expect(container.textContent).toEqual('A1B1');
  });

  // In React 18, you can't observe in between a sync render and its
  // passive effects, so this is only relevant to legacy roots
  // @gate !supportsNativeUseSyncExternalStore
  test(
    "compares to current state before bailing out, even when there's a " +
      'mutation in between the sync and passive effects',
    async () => {
      const store = createExternalStore(0);

      function App() {
        const value = useSyncExternalStore(store.subscribe, store.getState);
        useEffect(() => {
          Scheduler.unstable_yieldValue('Passive effect: ' + value);
        }, [value]);
        return <Text text={value} />;
      }

      const container = document.createElement('div');
      const root = createRoot(container);
      act(() => root.render(<App />));
      expect(Scheduler).toHaveYielded([0, 'Passive effect: 0']);

      // Schedule an update. We'll intentionally not use `act` so that we can
      // insert a mutation before React subscribes to the store in a
      // passive effect.
      store.set(1);
      expect(Scheduler).toHaveYielded([
        1,
        // Passive effect hasn't fired yet
      ]);
      expect(container.textContent).toEqual('1');

      // Flip the store state back to the previous value.
      store.set(0);
      expect(Scheduler).toHaveYielded([
        'Passive effect: 1',
        // Re-render. If the current state were tracked by updating a ref in a
        // passive effect, then this would break because the previous render's
        // passive effect hasn't fired yet, so we'd incorrectly think that
        // the state hasn't changed.
        0,
      ]);
      // Should flip back to 0
      expect(container.textContent).toEqual('0');
    },
  );

  test('mutating the store in between render and commit when getSnapshot has changed', () => {
    const store = createExternalStore({a: 1, b: 1});

    const getSnapshotA = () => store.getState().a;
    const getSnapshotB = () => store.getState().b;

    function Child1({step}) {
      const value = useSyncExternalStore(store.subscribe, store.getState);
      useLayoutEffect(() => {
        if (step === 1) {
          // Update B in a layout effect. This happens in the same commit
          // that changed the getSnapshot in Child2. Child2's effects haven't
          // fired yet, so it doesn't have access to the latest getSnapshot. So
          // it can't use the getSnapshot to bail out.
          Scheduler.unstable_yieldValue('Update B in commit phase');
          store.set({a: value.a, b: 2});
        }
      }, [step]);
      return null;
    }

    function Child2({step}) {
      const label = step === 0 ? 'A' : 'B';
      const getSnapshot = step === 0 ? getSnapshotA : getSnapshotB;
      const value = useSyncExternalStore(store.subscribe, getSnapshot);
      return <Text text={label + value} />;
    }

    let setStep;
    function App() {
      const [step, _setStep] = useState(0);
      setStep = _setStep;
      return (
        <>
          <Child1 step={step} />
          <Child2 step={step} />
        </>
      );
    }

    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => root.render(<App />));
    expect(Scheduler).toHaveYielded(['A1']);
    expect(container.textContent).toEqual('A1');

    act(() => {
      // Change getSnapshot and update the store in the same batch
      setStep(1);
    });
    expect(Scheduler).toHaveYielded([
      'B1',
      'Update B in commit phase',
      // If Child2 had used the old getSnapshot to bail out, then it would have
      // incorrectly bailed out here instead of re-rendering.
      'B2',
    ]);
    expect(container.textContent).toEqual('B2');
  });

  test('mutating the store in between render and commit when getSnapshot has _not_ changed', () => {
    // Same as previous test, but `getSnapshot` does not change
    const store = createExternalStore({a: 1, b: 1});

    const getSnapshotA = () => store.getState().a;

    function Child1({step}) {
      const value = useSyncExternalStore(store.subscribe, store.getState);
      useLayoutEffect(() => {
        if (step === 1) {
          // Update B in a layout effect. This happens in the same commit
          // that changed the getSnapshot in Child2. Child2's effects haven't
          // fired yet, so it doesn't have access to the latest getSnapshot. So
          // it can't use the getSnapshot to bail out.
          Scheduler.unstable_yieldValue('Update B in commit phase');
          store.set({a: value.a, b: 2});
        }
      }, [step]);
      return null;
    }

    function Child2({step}) {
      const value = useSyncExternalStore(store.subscribe, getSnapshotA);
      return <Text text={'A' + value} />;
    }

    let setStep;
    function App() {
      const [step, _setStep] = useState(0);
      setStep = _setStep;
      return (
        <>
          <Child1 step={step} />
          <Child2 step={step} />
        </>
      );
    }

    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => root.render(<App />));
    expect(Scheduler).toHaveYielded(['A1']);
    expect(container.textContent).toEqual('A1');

    // This will cause a layout effect, and in the layout effect we'll update
    // the store
    act(() => {
      setStep(1);
    });
    expect(Scheduler).toHaveYielded([
      'A1',
      // This updates B, but since Child2 doesn't subscribe to B, it doesn't
      // need to re-render.
      'Update B in commit phase',
      // No re-render
    ]);
    expect(container.textContent).toEqual('A1');
  });

  test("does not bail out if the previous update hasn't finished yet", async () => {
    const store = createExternalStore(0);

    function Child1() {
      const value = useSyncExternalStore(store.subscribe, store.getState);
      useLayoutEffect(() => {
        if (value === 1) {
          Scheduler.unstable_yieldValue('Reset back to 0');
          store.set(0);
        }
      }, [value]);
      return <Text text={value} />;
    }

    function Child2() {
      const value = useSyncExternalStore(store.subscribe, store.getState);
      return <Text text={value} />;
    }

    const container = document.createElement('div');
    const root = createRoot(container);
    act(() =>
      root.render(
        <>
          <Child1 />
          <Child2 />
        </>,
      ),
    );
    expect(Scheduler).toHaveYielded([0, 0]);
    expect(container.textContent).toEqual('00');

    await act(() => {
      store.set(1);
    });
    expect(Scheduler).toHaveYielded([1, 1, 'Reset back to 0', 0, 0]);
    expect(container.textContent).toEqual('00');
  });

  test('uses the latest getSnapshot, even if it changed in the same batch as a store update', () => {
    const store = createExternalStore({a: 0, b: 0});

    const getSnapshotA = () => store.getState().a;
    const getSnapshotB = () => store.getState().b;

    let setGetSnapshot;
    function App() {
      const [getSnapshot, _setGetSnapshot] = useState(() => getSnapshotA);
      setGetSnapshot = _setGetSnapshot;
      const text = useSyncExternalStore(store.subscribe, getSnapshot);
      return <Text text={text} />;
    }

    const container = document.createElement('div');
    const root = createRoot(container);
    act(() => root.render(<App />));
    expect(Scheduler).toHaveYielded([0]);

    // Update the store and getSnapshot at the same time
    act(() => {
      ReactDOM.flushSync(() => {
        setGetSnapshot(() => getSnapshotB);
        store.set({a: 1, b: 2});
      });
    });
    // It should read from B instead of A
    expect(Scheduler).toHaveYielded([2]);
    expect(container.textContent).toEqual('2');
  });

  test('handles errors thrown by getSnapshot', async () => {
    class ErrorBoundary extends React.Component {
      state = {error: null};
      static getDerivedStateFromError(error) {
        return {error};
      }
      render() {
        if (this.state.error) {
          return <Text text={this.state.error.message} />;
        }
        return this.props.children;
      }
    }

    const store = createExternalStore({
      value: 0,
      throwInGetSnapshot: false,
      throwInIsEqual: false,
    });

    function App() {
      const {value} = useSyncExternalStore(store.subscribe, () => {
        const state = store.getState();
        if (state.throwInGetSnapshot) {
          throw new Error('Error in getSnapshot');
        }
        return state;
      });
      return <Text text={value} />;
    }

    const errorBoundary = React.createRef(null);
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() =>
      root.render(
        <ErrorBoundary ref={errorBoundary}>
          <App />
        </ErrorBoundary>,
      ),
    );
    expect(Scheduler).toHaveYielded([0]);
    expect(container.textContent).toEqual('0');

    // Update that throws in a getSnapshot. We can catch it with an error boundary.
    await act(() => {
      store.set({value: 1, throwInGetSnapshot: true, throwInIsEqual: false});
    });
    if (gate(flags => flags.supportsNativeUseSyncExternalStore)) {
      expect(Scheduler).toHaveYielded([
        'Error in getSnapshot',
        // In a concurrent root, React renders a second time to attempt to
        // recover from the error.
        'Error in getSnapshot',
      ]);
    } else {
      expect(Scheduler).toHaveYielded(['Error in getSnapshot']);
    }
    expect(container.textContent).toEqual('Error in getSnapshot');
  });

  test('Infinite loop if getSnapshot keeps returning new reference', () => {
    const store = createExternalStore({});

    function App() {
      const text = useSyncExternalStore(store.subscribe, () => ({}));
      return <Text text={JSON.stringify(text)} />;
    }

    const container = document.createElement('div');
    const root = createRoot(container);

    expect(() => {
      expect(() => act(() => root.render(<App />))).toThrow(
        'Maximum update depth exceeded. This can happen when a component repeatedly ' +
          'calls setState inside componentWillUpdate or componentDidUpdate. React limits ' +
          'the number of nested updates to prevent infinite loops.',
      );
    }).toErrorDev(
      'The result of getSnapshot should be cached to avoid an infinite loop',
    );
  });

  describe('extra features implemented in user-space', () => {
    // The selector implementation uses the lazy ref initialization pattern
    // @gate !(enableUseRefAccessWarning && __DEV__)
    test('memoized selectors are only called once per update', async () => {
      const store = createExternalStore({a: 0, b: 0});

      function selector(state) {
        Scheduler.unstable_yieldValue('Selector');
        return state.a;
      }

      function App() {
        Scheduler.unstable_yieldValue('App');
        const a = useSyncExternalStoreExtra(
          store.subscribe,
          store.getState,
          null,
          selector,
        );
        return <Text text={'A' + a} />;
      }

      const container = document.createElement('div');
      const root = createRoot(container);
      act(() => root.render(<App />));

      expect(Scheduler).toHaveYielded(['App', 'Selector', 'A0']);
      expect(container.textContent).toEqual('A0');

      // Update the store
      await act(() => {
        store.set({a: 1, b: 0});
      });
      expect(Scheduler).toHaveYielded([
        // The selector runs before React starts rendering
        'Selector',
        'App',
        // And because the selector didn't change during render, we can reuse
        // the previous result without running the selector again
        'A1',
      ]);
      expect(container.textContent).toEqual('A1');
    });

    // The selector implementation uses the lazy ref initialization pattern
    // @gate !(enableUseRefAccessWarning && __DEV__)
    test('Using isEqual to bailout', async () => {
      const store = createExternalStore({a: 0, b: 0});

      function A() {
        const {a} = useSyncExternalStoreExtra(
          store.subscribe,
          store.getState,
          null,
          state => ({a: state.a}),
          (state1, state2) => state1.a === state2.a,
        );
        return <Text text={'A' + a} />;
      }
      function B() {
        const {b} = useSyncExternalStoreExtra(
          store.subscribe,
          store.getState,
          null,
          state => {
            return {b: state.b};
          },
          (state1, state2) => state1.b === state2.b,
        );
        return <Text text={'B' + b} />;
      }

      function App() {
        return (
          <>
            <A />
            <B />
          </>
        );
      }

      const container = document.createElement('div');
      const root = createRoot(container);
      act(() => root.render(<App />));

      expect(Scheduler).toHaveYielded(['A0', 'B0']);
      expect(container.textContent).toEqual('A0B0');

      // Update b but not a
      await act(() => {
        store.set({a: 0, b: 1});
      });
      // Only b re-renders
      expect(Scheduler).toHaveYielded(['B1']);
      expect(container.textContent).toEqual('A0B1');

      // Update a but not b
      await act(() => {
        store.set({a: 1, b: 1});
      });
      // Only a re-renders
      expect(Scheduler).toHaveYielded(['A1']);
      expect(container.textContent).toEqual('A1B1');
    });

    test('basic server hydration', async () => {
      const store = createExternalStore('client');

      const ref = React.createRef();
      function App() {
        const text = useSyncExternalStore(
          store.subscribe,
          store.getState,
          () => 'server',
        );
        useEffect(() => {
          Scheduler.unstable_yieldValue('Passive effect: ' + text);
        }, [text]);
        return (
          <div ref={ref}>
            <Text text={text} />
          </div>
        );
      }

      const container = document.createElement('div');
      container.innerHTML = '<div>server</div>';
      const serverRenderedDiv = container.getElementsByTagName('div')[0];

      if (gate(flags => flags.supportsNativeUseSyncExternalStore)) {
        act(() => {
          ReactDOM.hydrateRoot(container, <App />);
        });
        expect(Scheduler).toHaveYielded([
          // First it hydrates the server rendered HTML
          'server',
          'Passive effect: server',
          // Then in a second paint, it re-renders with the client state
          'client',
          'Passive effect: client',
        ]);
      } else {
        // In the userspace shim, there's no mechanism to detect whether we're
        // currently hydrating, so `getServerSnapshot` is not called on the
        // client. To avoid this server mismatch warning, user must account for
        // this themselves and return the correct value inside `getSnapshot`.
        act(() => {
          expect(() => ReactDOM.hydrate(<App />, container)).toErrorDev(
            'Text content did not match',
          );
        });
        expect(Scheduler).toHaveYielded(['client', 'Passive effect: client']);
      }
      expect(container.textContent).toEqual('client');
      expect(ref.current).toEqual(serverRenderedDiv);
    });
  });

  // The selector implementation uses the lazy ref initialization pattern
  // @gate !(enableUseRefAccessWarning && __DEV__)
  test('compares selection to rendered selection even if selector changes', async () => {
    const store = createExternalStore({items: ['A', 'B']});

    const shallowEqualArray = (a, b) => {
      if (a.length !== b.length) {
        return false;
      }
      for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
          return false;
        }
      }
      return true;
    };

    const List = React.memo(({items}) => {
      return (
        <ul>
          {items.map(text => (
            <li key={text}>
              <Text key={text} text={text} />
            </li>
          ))}
        </ul>
      );
    });

    function App({step}) {
      const inlineSelector = state => {
        Scheduler.unstable_yieldValue('Inline selector');
        return [...state.items, 'C'];
      };
      const items = useSyncExternalStoreExtra(
        store.subscribe,
        store.getState,
        null,
        inlineSelector,
        shallowEqualArray,
      );
      return (
        <>
          <List items={items} />
          <Text text={'Sibling: ' + step} />
        </>
      );
    }

    const container = document.createElement('div');
    const root = createRoot(container);
    await act(() => {
      root.render(<App step={0} />);
    });
    expect(Scheduler).toHaveYielded([
      'Inline selector',
      'A',
      'B',
      'C',
      'Sibling: 0',
    ]);

    await act(() => {
      root.render(<App step={1} />);
    });
    expect(Scheduler).toHaveYielded([
      // We had to call the selector again because it's not memoized
      'Inline selector',

      // But because the result was the same (according to isEqual) we can
      // bail out of rendering the memoized list. These are skipped:
      // 'A',
      // 'B',
      // 'C',

      'Sibling: 1',
    ]);
  });

  describe('selector and isEqual error handling in extra', () => {
    let ErrorBoundary;
    beforeAll(() => {
      spyOnDev(console, 'warn');
      ErrorBoundary = class extends React.Component {
        state = {error: null};
        static getDerivedStateFromError(error) {
          return {error};
        }
        render() {
          if (this.state.error) {
            return <Text text={this.state.error.message} />;
          }
          return this.props.children;
        }
      };
    });

    it('selector can throw on update', async () => {
      const store = createExternalStore({a: 'a'});
      const selector = state => state.a.toUpperCase();

      function App() {
        const a = useSyncExternalStoreExtra(
          store.subscribe,
          store.getState,
          null,
          selector,
        );
        return <Text text={a} />;
      }

      const container = document.createElement('div');
      const root = createRoot(container);
      await act(() =>
        root.render(
          <ErrorBoundary>
            <App />
          </ErrorBoundary>,
        ),
      );

      expect(container.textContent).toEqual('A');

      await act(() => {
        store.set({});
      });
      expect(container.textContent).toEqual(
        "Cannot read property 'toUpperCase' of undefined",
      );
    });

    it('isEqual can throw on update', async () => {
      const store = createExternalStore({a: 'A'});
      const selector = state => state.a;
      const isEqual = (left, right) => left.a.trim() === right.a.trim();

      function App() {
        const a = useSyncExternalStoreExtra(
          store.subscribe,
          store.getState,
          null,
          selector,
          isEqual,
        );
        return <Text text={a} />;
      }

      const container = document.createElement('div');
      const root = createRoot(container);
      await act(() =>
        root.render(
          <ErrorBoundary>
            <App />
          </ErrorBoundary>,
        ),
      );

      expect(container.textContent).toEqual('A');

      await act(() => {
        store.set({});
      });
      expect(container.textContent).toEqual(
        "Cannot read property 'trim' of undefined",
      );
    });
  });
});
