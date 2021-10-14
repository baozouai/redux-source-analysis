/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 *
 * @jest-environment node
 */

'use strict';

let useSyncExternalStore;
let React;
let ReactDOM;
let ReactDOMServer;
let Scheduler;

// This tests the userspace shim of `useSyncExternalStore` in a server-rendering
// (Node) environment
describe('useSyncExternalStore (userspace shim, server rendering)', () => {
  beforeEach(() => {
    jest.resetModules();

    // Remove useSyncExternalStore from the React imports so that we use the
    // shim instead. Also removing startTransition, since we use that to detect
    // outdated 18 alphas that don't yet include useSyncExternalStore.
    //
    // Longer term, we'll probably test this branch using an actual build of
    // React 17.
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

    React = require('react');
    ReactDOM = require('react-dom');
    ReactDOMServer = require('react-dom/server');
    Scheduler = require('scheduler');

    useSyncExternalStore = require('use-sync-external-store')
      .useSyncExternalStore;
  });

  function Text({text}) {
    Scheduler.unstable_yieldValue(text);
    return text;
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

  test('basic server render', async () => {
    const store = createExternalStore('client');

    function App() {
      const text = useSyncExternalStore(
        store.subscribe,
        store.getState,
        () => 'server',
      );
      return <Text text={text} />;
    }

    const html = ReactDOMServer.renderToString(<App />);

    // We don't call getServerSnapshot in the shim
    expect(Scheduler).toHaveYielded(['client']);
    expect(html).toEqual('client');
  });
});
