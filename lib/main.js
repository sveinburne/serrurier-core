import { decorateDescription,  registerMaker, ActionsStore, lockApi as lockCoreApi } from './core';
import Logger from './Logger';
import {
    lockApi as lockMakeSecureApi,
    registerIsolatedReporter,
    publishServerReporter,
    subscribeServerReporter
} from './makers/make-secure';

const setLogLevel = Logger.setLevel;

function lockApi() {
    lockCoreApi();
    lockMakeSecureApi();
    Logger.silence();
}

function silence() {
    Logger.silence();
}

export {
    ActionsStore,
    decorateDescription,
    registerMaker,
    Logger,
    lockApi,
    silence,
    setLogLevel,
    registerIsolatedReporter,
    publishServerReporter,
    subscribeServerReporter
};
