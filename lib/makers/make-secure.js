import { Event, Class } from 'meteor/jagi:astronomy';
import { Match } from 'meteor/check';
import { ActionsStore } from '../core'
import { ensures, ensuresArg } from '../ensures';
import { first, partial, getp, last } from '../lodash';
import Logger from '../Logger';
import { Meteor } from 'meteor/meteor';
const logger = new Logger('maker:secure');

let isApiLocked = false;

const reportersMap = new Map();
const serverReportersNames = new Set();

/**
 * Sanitize any Astro.Class instance
 * @param {!Astro.Class} target
 * @return {object} A serializable target
 */
function makeTargetSerializable( target ){

    if(Match.test( target, Class )) {
        const className=target.constructor.getName(),
            serial={};
        //noinspection JSUnresolvedFunction
        serial[className]=target.raw();
        return serial;
    } else logger.warn( 'The target of a decoration should always be an instance of  `Astro.Class`' );

}

/**
 *
 * @param {Astro.Event} e - an event from Astronomy events.
 * @param {Astro.Class} e.target - the target of the event
 * @param {Astro.Class} e.currentTarget - the current target of the event
 * @return {security_context}
 */
function eventToContext( e ){
    ensuresArg('In function `eventToContext`, param `e`', e, Event);
    const context = {
        target:makeTargetSerializable(e.target)
    };
    if(e.currentTarget !== e.target){
        context.currentTarget=makeTargetSerializable(e.currentTarget);
    }
    return context;
}

/**
 * Run a function securely, calling mapped reporters on error.
 * @param {!Function} func
 * @param {...*} args
 */
function runSecurely( func, ...args ){
    try {
        return func.apply( this, args );
    } catch(e){
        const possibleEvent =  first(args);
        const Error = Object.getPrototypeOf( e ).constructor;
        const handlers = reportersMap.get( Error );
        const action = ActionsStore.getProp( func, 'descriptor' );
        const isEventHandler = possibleEvent instanceof Event;
        const possibleCallback = last( arguments );
        let   callback = null;
        let context = Object.assign( e.context || {}, { action, stackTrace: e.stack }, (() => {
            if( isEventHandler ) return eventToContext( possibleEvent );
            //noinspection JSCheckFunctionSignatures
            else return { target: makeTargetSerializable( this ) }
        })());
        if (Match.test( possibleCallback, Function ) && func !== possibleCallback) callback = possibleCallback;
        if(isEventHandler) possibleEvent.preventDefault();
        if(Match.test( handlers, Array ) && handlers.length) {
            handlers.forEach( ( handler ) => handler.call( this, context, e ) );
            // if ca callback is present, call it.
            if(callback) callback.call( this, e, null );
        }
        else {
            // if ca callback is present, call it.
            if(callback) callback.call( this, e, null );
            else throw e;
        }
    }
}


/**
 * Make a function secured, i.e. {@link runSecurely}
 * @param {!Function} func
 * @return {Function}
 */
export function makeSecure( func ){
    if(!ActionsStore.getProp( func, 'isSecured' )){
        ActionsStore.setProp( func, 'isSecured', true );
        return partial( runSecurely, func );
    } else return func;
}


function _registerReporter( ExceptionClass, reporter ) {
    if(!reportersMap.has( ExceptionClass )) reportersMap.set( ExceptionClass, [] );
    reportersMap.get( ExceptionClass ).push( reporter );
}
/**
 *
 * @param {!Function} ExceptionClass - The error constructor.
 * @param {function( {object} context, {object} exception )} reporter
 */
export function registerIsolatedReporter( ExceptionClass, reporter ) {
    if(!isApiLocked) {
        ensuresArg( 'In function `registerIsolatedReporter`, arg `ExceptionClass`', ExceptionClass, Function );
        ensuresArg( 'In function `registerIsolatedReporter`, arg `reporter`', reporter, Function );
        _registerReporter( ExceptionClass, reporter );
    }
}

function createReportName( ExceptionClass, name ) {
    ensuresArg( 'In function `registerIsolatedReporter`, arg `ExceptionClass`', ExceptionClass, Function );
    ensuresArg( 'In function `registerIsolatedReporter`, arg `name`', name, Match.Optional( String ) );
    let methodName = name ;
    if(!name) {
        const errorName = getp( ExceptionClass, 'prototype.name' );
        ensures( 'The ExceptionClass must have a `ExceptionClass.prototype.name`', errorName, String );
        methodName = '/serrurier/decorators/security/'+errorName;
        ensures( 'In `registerServerHandler` : a server handler is already registered to this error. You can provide a name as third argument to work around this limitation.',
            serverReportersNames.has( methodName ), false );
    } else ensures( 'A server handler is already registered to this error. Provide a different name (third argument).',
        serverReportersNames.has( methodName ), false );
    serverReportersNames.add( methodName );
    return methodName;
}

/**
 * @locus server
 * @param {!Function} ExceptionClass - The error constructor. The field `Error.prototype.name` must exist if you don't want to provide the third argument (name).
 * @param {function( {object} context, {object} exception )} serverReporter
 * @param {String} [name] - The name of the Meteor method that will be used in the background. Default is namespaced by '/serrurier/'.
 */
export function publishServerReporter( ExceptionClass, serverReporter, name ) {
    if(!isApiLocked) {
        if(Meteor.isServer) {
            ensuresArg( 'In function `registerIsolatedReporter`, arg `serverReporter`', serverReporter, Function );
            const methodName = createReportName( ExceptionClass, name );
            // register the method
            Meteor.methods({ [methodName]: serverReporter });
        } else {
            throw new Error('The function `publishServerReporter` must be called on server. When published on server, subscribe to it with `subscribeServerReporter`.')
        }
    }
}

/**
 *
 * @locus client
 * @param {!Function} ExceptionClass - The error constructor. The field `Error.prototype.name` must exist if you don't want to provide the third argument (name).
 * @param {String} [name] - The name of the Meteor method that will be used in the background. Default is namespaced by '/serrurier/'.
 */
export function subscribeServerReporter( ExceptionClass, name ) {
    if(!isApiLocked) {
        if(Meteor.isClient) {
            const methodName = createReportName( ExceptionClass, name );
            _registerReporter( ExceptionClass, partial( Meteor.call, methodName ) );
        } else {
            throw new Error( 'The function `subscribeServerReporter` must be called on client. When subscribed on client, publish to it with `publishServerReporter`.' )
        }
    }
}

export function lockApi() {
    isApiLocked = true;
}