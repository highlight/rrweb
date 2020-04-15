import { InterpreterStatus as t, createMachine as f } from '../../node_modules/@xstate/fsm/es/index.js';

function toEventObject(event) {
    return (typeof event === 'string' ? { type: event } : event);
}
var INIT_EVENT = { type: 'xstate.init' };
var executeStateActions = function (state, event) {
    return state.actions.forEach(function (_a) {
        var exec = _a.exec;
        return exec && exec(state.context, event);
    });
};
function interpret(machine) {
    var state = machine.initialState;
    var status = t.NotStarted;
    var listeners = new Set();
    var service = {
        _machine: machine,
        send: function (event) {
            if (status !== t.Running) {
                return;
            }
            state = machine.transition(state, event);
            executeStateActions(state, toEventObject(event));
            listeners.forEach(function (listener) { return listener(state); });
        },
        subscribe: function (listener) {
            listeners.add(listener);
            listener(state);
            return {
                unsubscribe: function () { return listeners.delete(listener); },
            };
        },
        start: function () {
            status = t.Running;
            executeStateActions(state, INIT_EVENT);
            return service;
        },
        stop: function () {
            status = t.Stopped;
            listeners.clear();
            return service;
        },
        get state() {
            return state;
        },
        get status() {
            return status;
        },
    };
    return service;
}
function createPlayerService(context) {
    var playerMachine = f({
        id: 'player',
        context: context,
        initial: 'inited',
        states: {
            inited: {
                on: {
                    PLAY: 'playing',
                },
            },
            playing: {
                on: {
                    PAUSE: 'paused',
                    END: 'ended',
                    FAST_FORWARD: 'skipping',
                },
            },
            paused: {
                on: {
                    RESUME: 'playing',
                },
            },
            skipping: {
                on: {
                    BACK_TO_NORMAL: 'playing',
                },
            },
            ended: {
                on: {
                    REPLAY: 'playing',
                },
            },
        },
    });
    return interpret(playerMachine);
}

export { createPlayerService };
