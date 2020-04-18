import { __assign, __values } from '../../node_modules/tslib/tslib.es6.js';
import { ReplayerEvents } from '../types.js';
import { getDelay } from './timer.js';
import { interpret as f, createMachine as c, assign as r } from '../../node_modules/@xstate/fsm/es/index.js';

function createPlayerService(context, _a) {
    var getCastFn = _a.getCastFn, emitter = _a.emitter;
    var playerMachine = c({
        id: 'player',
        context: context,
        initial: 'inited',
        states: {
            inited: {
                on: {
                    PLAY: {
                        target: 'playing',
                        actions: ['recordTimeOffset', 'play'],
                    },
                    TO_LIVE: {
                        target: 'live',
                        actions: ['startLive'],
                    },
                },
            },
            playing: {
                on: {
                    PAUSE: {
                        target: 'paused',
                        actions: ['pause'],
                    },
                    END: 'ended',
                    FAST_FORWARD: 'skipping',
                    CAST_EVENT: {
                        target: 'playing',
                        actions: 'castEvent',
                    },
                },
            },
            paused: {
                on: {
                    RESUME: {
                        target: 'playing',
                        actions: ['recordTimeOffset', 'play'],
                    },
                    CAST_EVENT: {
                        target: 'paused',
                        actions: 'castEvent',
                    },
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
            live: {
                on: {
                    ADD_EVENT: {
                        target: 'live',
                        actions: ['addEvent'],
                    },
                },
            },
        },
    }, {
        actions: {
            castEvent: r({
                lastPlayedEvent: function (ctx, event) {
                    if (event.type === 'CAST_EVENT') {
                        return event.payload.event;
                    }
                    return context.lastPlayedEvent;
                },
            }),
            recordTimeOffset: r(function (ctx, event) {
                var timeOffset = ctx.timeOffset;
                if ('payload' in event && 'timeOffset' in event.payload) {
                    timeOffset = event.payload.timeOffset;
                }
                return __assign(__assign({}, ctx), { timeOffset: timeOffset, baselineTime: ctx.events[0].timestamp + timeOffset });
            }),
            play: function (ctx) {
                var e_1, _a;
                var timer = ctx.timer, events = ctx.events, baselineTime = ctx.baselineTime, lastPlayedEvent = ctx.lastPlayedEvent;
                timer.clear();
                var actions = new Array();
                var _loop_1 = function (event) {
                    if (lastPlayedEvent &&
                        (event.timestamp <= lastPlayedEvent.timestamp ||
                            event === lastPlayedEvent)) {
                        return "continue";
                    }
                    var isSync = event.timestamp < baselineTime;
                    var castFn = getCastFn(event, isSync);
                    if (isSync) {
                        castFn();
                    }
                    else {
                        actions.push({
                            doAction: function () {
                                castFn();
                                emitter.emit(ReplayerEvents.EventCast, event);
                            },
                            delay: getDelay(event, baselineTime),
                        });
                    }
                };
                try {
                    for (var events_1 = __values(events), events_1_1 = events_1.next(); !events_1_1.done; events_1_1 = events_1.next()) {
                        var event = events_1_1.value;
                        _loop_1(event);
                    }
                }
                catch (e_1_1) { e_1 = { error: e_1_1 }; }
                finally {
                    try {
                        if (events_1_1 && !events_1_1.done && (_a = events_1.return)) _a.call(events_1);
                    }
                    finally { if (e_1) throw e_1.error; }
                }
                timer.addActions(actions);
                timer.start();
            },
            pause: function (ctx) {
                ctx.timer.clear();
            },
            startLive: r({
                baselineTime: function (ctx, event) {
                    ctx.timer.start();
                    if (event.type === 'TO_LIVE' && event.payload.baselineTime) {
                        return event.payload.baselineTime;
                    }
                    return Date.now();
                },
            }),
            addEvent: r(function (ctx, machineEvent) {
                var baselineTime = ctx.baselineTime, timer = ctx.timer, events = ctx.events;
                if (machineEvent.type === 'ADD_EVENT') {
                    var event_1 = machineEvent.payload.event;
                    events.push(event_1);
                    var isSync = event_1.timestamp < baselineTime;
                    var castFn_1 = getCastFn(event_1, isSync);
                    if (isSync) {
                        castFn_1();
                    }
                    else {
                        timer.addAction({
                            doAction: function () {
                                castFn_1();
                                emitter.emit(ReplayerEvents.EventCast, event_1);
                            },
                            delay: getDelay(event_1, baselineTime),
                        });
                    }
                }
                return __assign(__assign({}, ctx), { events: events });
            }),
        },
    });
    return f(playerMachine);
}

export { createPlayerService };
