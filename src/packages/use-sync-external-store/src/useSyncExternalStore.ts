import { canUseDOM } from './util';
import { useSyncExternalStore as client } from './useSyncExternalStoreClient';
import { useSyncExternalStore as server } from './useSyncExternalStoreServer';
import * as React from 'react';
// @ts-ignore
const { unstable_useSyncExternalStore: builtInAPI } = React;

export const useSyncExternalStore = client;