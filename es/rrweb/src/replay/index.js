import { __assign, __values } from '../../node_modules/tslib/tslib.es6.js';
import { rebuild, buildNodeWithSN } from '../../node_modules/rrweb-snapshot/es/rrweb-snapshot.js';
import { mirror, polyfill } from '../utils.js';
import { ReplayerEvents, EventType, IncrementalSource, MediaInteractions, MouseInteractions } from '../types.js';
import * as mittProxy from '../../node_modules/mitt/dist/mitt.es.js';
import mitt$1 from '../../node_modules/mitt/dist/mitt.es.js';
import { polyfill as smoothscroll_1 } from '../../node_modules/smoothscroll-polyfill/dist/smoothscroll.js';
import { Timer } from './timer.js';
import { createPlayerService } from './machine.js';
import getInjectStyleRules from './styles/inject-style.js';

var SKIP_TIME_THRESHOLD = 10 * 1000;
var SKIP_TIME_INTERVAL = 5 * 1000;
var mitt = mitt$1 || mittProxy;
var REPLAY_CONSOLE_PREFIX = '[replayer]';
var defaultConfig = {
    speed: 1,
    root: document.body,
    loadTimeout: 0,
    skipInactive: false,
    showWarning: true,
    showDebug: false,
    blockClass: 'rr-block',
    liveMode: false,
    insertStyleRules: [],
    triggerFocus: true,
};
var Replayer = (function () {
    function Replayer(events, config) {
        this.emitter = mitt();
        this.noramlSpeed = -1;
        this.missingNodeRetryMap = {};
        if (!(config === null || config === void 0 ? void 0 : config.liveMode) && events.length < 2) {
            throw new Error('Replayer need at least 2 events.');
        }
        this.config = Object.assign({}, defaultConfig, config);
        this.handleResize = this.handleResize.bind(this);
        this.getCastFn = this.getCastFn.bind(this);
        this.emitter.on('resize', this.handleResize);
        smoothscroll_1();
        polyfill();
        this.setupDom();
        this.service = createPlayerService({
            events: events.map(function (e) {
                if (config && config.unpackFn) {
                    return config.unpackFn(e);
                }
                return e;
            }),
            timer: new Timer(this.config),
            speed: (config === null || config === void 0 ? void 0 : config.speed) || defaultConfig.speed,
            timeOffset: 0,
            baselineTime: 0,
            lastPlayedEvent: null,
        }, {
            getCastFn: this.getCastFn,
            emitter: this.emitter,
        });
        this.service.start();
        this.service.subscribe(function (state) {
            if (!state.changed) {
                return;
            }
        });
    }
    Object.defineProperty(Replayer.prototype, "timer", {
        get: function () {
            return this.service.state.context.timer;
        },
        enumerable: true,
        configurable: true
    });
    Replayer.prototype.on = function (event, handler) {
        this.emitter.on(event, handler);
    };
    Replayer.prototype.setConfig = function (config) {
        var _this = this;
        Object.keys(config).forEach(function (key) {
            _this.config[key] = config[key];
        });
        if (!this.config.skipInactive) {
            this.noramlSpeed = -1;
        }
    };
    Replayer.prototype.getMetaData = function () {
        var events = this.service.state.context.events;
        var firstEvent = events[0];
        var lastEvent = events[events.length - 1];
        return {
            totalTime: lastEvent.timestamp - firstEvent.timestamp,
        };
    };
    Replayer.prototype.getCurrentTime = function () {
        return this.timer.timeOffset + this.getTimeOffset();
    };
    Replayer.prototype.getTimeOffset = function () {
        var _a = this.service.state.context, baselineTime = _a.baselineTime, events = _a.events;
        return baselineTime - events[0].timestamp;
    };
    Replayer.prototype.play = function (timeOffset) {
        if (timeOffset === void 0) { timeOffset = 0; }
        this.service.send({ type: 'PLAY', payload: { timeOffset: timeOffset } });
        this.emitter.emit(ReplayerEvents.Start);
    };
    Replayer.prototype.pause = function () {
        this.service.send({ type: 'PAUSE' });
        this.emitter.emit(ReplayerEvents.Pause);
    };
    Replayer.prototype.resume = function (timeOffset) {
        if (timeOffset === void 0) { timeOffset = 0; }
        this.service.send({ type: 'RESUME', payload: { timeOffset: timeOffset } });
        this.emitter.emit(ReplayerEvents.Resume);
    };
    Replayer.prototype.startLive = function (baselineTime) {
        this.service.send({ type: 'TO_LIVE', payload: { baselineTime: baselineTime } });
    };
    Replayer.prototype.addEvent = function (rawEvent) {
        var _this = this;
        var event = this.config.unpackFn
            ? this.config.unpackFn(rawEvent)
            : rawEvent;
        Promise.resolve().then(function () {
            return _this.service.send({ type: 'ADD_EVENT', payload: { event: event } });
        });
    };
    Replayer.prototype.enableInteract = function () {
        this.iframe.setAttribute('scrolling', 'auto');
        this.iframe.style.pointerEvents = 'auto';
    };
    Replayer.prototype.disableInteract = function () {
        this.iframe.setAttribute('scrolling', 'no');
        this.iframe.style.pointerEvents = 'none';
    };
    Replayer.prototype.setupDom = function () {
        this.wrapper = document.createElement('div');
        this.wrapper.classList.add('replayer-wrapper');
        this.config.root.appendChild(this.wrapper);
        this.mouse = document.createElement('div');
        this.mouse.classList.add('replayer-mouse');
        this.wrapper.appendChild(this.mouse);
        this.iframe = document.createElement('iframe');
        this.iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts');
        this.disableInteract();
        this.wrapper.appendChild(this.iframe);
    };
    Replayer.prototype.handleResize = function (dimension) {
        this.iframe.width = dimension.width + "px";
        this.iframe.height = dimension.height + "px";
    };
    Replayer.prototype.getCastFn = function (event, isSync) {
        var _this = this;
        if (isSync === void 0) { isSync = false; }
        var events = this.service.state.context.events;
        var castFn;
        switch (event.type) {
            case EventType.DomContentLoaded:
            case EventType.Load:
                break;
            case EventType.Meta:
                castFn = function () {
                    return _this.emitter.emit(ReplayerEvents.Resize, {
                        width: event.data.width,
                        height: event.data.height,
                    });
                };
                break;
            case EventType.FullSnapshot:
                castFn = function () {
                    _this.rebuildFullSnapshot(event);
                    _this.iframe.contentWindow.scrollTo(event.data.initialOffset);
                };
                break;
            case EventType.IncrementalSnapshot:
                castFn = function () {
                    var e_1, _a;
                    _this.applyIncremental(event, isSync);
                    if (event === _this.nextUserInteractionEvent) {
                        _this.nextUserInteractionEvent = null;
                        _this.restoreSpeed();
                    }
                    if (_this.config.skipInactive && !_this.nextUserInteractionEvent) {
                        try {
                            for (var events_1 = __values(events), events_1_1 = events_1.next(); !events_1_1.done; events_1_1 = events_1.next()) {
                                var _event = events_1_1.value;
                                if (_event.timestamp <= event.timestamp) {
                                    continue;
                                }
                                if (_this.isUserInteraction(_event)) {
                                    if (_event.delay - event.delay >
                                        SKIP_TIME_THRESHOLD * _this.config.speed) {
                                        _this.nextUserInteractionEvent = _event;
                                    }
                                    break;
                                }
                            }
                        }
                        catch (e_1_1) { e_1 = { error: e_1_1 }; }
                        finally {
                            try {
                                if (events_1_1 && !events_1_1.done && (_a = events_1.return)) _a.call(events_1);
                            }
                            finally { if (e_1) throw e_1.error; }
                        }
                        if (_this.nextUserInteractionEvent) {
                            _this.noramlSpeed = _this.config.speed;
                            var skipTime = _this.nextUserInteractionEvent.delay - event.delay;
                            var payload = {
                                speed: Math.min(Math.round(skipTime / SKIP_TIME_INTERVAL), 360),
                            };
                            _this.setConfig(payload);
                            _this.emitter.emit(ReplayerEvents.SkipStart, payload);
                        }
                    }
                };
                break;
        }
        var wrappedCastFn = function () {
            if (castFn) {
                castFn();
            }
            _this.service.send({ type: 'CAST_EVENT', payload: { event: event } });
            if (event === events[events.length - 1]) {
                _this.restoreSpeed();
                _this.service.send('END');
                _this.emitter.emit(ReplayerEvents.Finish);
            }
        };
        return wrappedCastFn;
    };
    Replayer.prototype.rebuildFullSnapshot = function (event) {
        if (Object.keys(this.missingNodeRetryMap).length) {
            console.warn('Found unresolved missing node map', this.missingNodeRetryMap);
        }
        this.missingNodeRetryMap = {};
        mirror.map = rebuild(event.data.node, this.iframe.contentDocument)[1];
        var styleEl = document.createElement('style');
        var _a = this.iframe.contentDocument, documentElement = _a.documentElement, head = _a.head;
        documentElement.insertBefore(styleEl, head);
        var injectStylesRules = getInjectStyleRules(this.config.blockClass).concat(this.config.insertStyleRules);
        for (var idx = 0; idx < injectStylesRules.length; idx++) {
            styleEl.sheet.insertRule(injectStylesRules[idx], idx);
        }
        this.emitter.emit(ReplayerEvents.FullsnapshotRebuilded);
        this.waitForStylesheetLoad();
    };
    Replayer.prototype.waitForStylesheetLoad = function () {
        var _this = this;
        var head = this.iframe.contentDocument.head;
        if (head) {
            var unloadSheets_1 = new Set();
            var timer_1;
            var beforeLoadState_1 = this.service.state;
            head
                .querySelectorAll('link[rel="stylesheet"]')
                .forEach(function (css) {
                if (!css.sheet) {
                    unloadSheets_1.add(css);
                    css.addEventListener('load', function () {
                        unloadSheets_1.delete(css);
                        if (unloadSheets_1.size === 0 && timer_1 !== -1) {
                            if (beforeLoadState_1.matches('playing')) {
                                _this.resume(_this.getCurrentTime());
                            }
                            _this.emitter.emit(ReplayerEvents.LoadStylesheetEnd);
                            if (timer_1) {
                                window.clearTimeout(timer_1);
                            }
                        }
                    });
                }
            });
            if (unloadSheets_1.size > 0) {
                this.service.send({ type: 'PAUSE' });
                this.emitter.emit(ReplayerEvents.LoadStylesheetStart);
                timer_1 = window.setTimeout(function () {
                    if (beforeLoadState_1.matches('playing')) {
                        _this.resume(_this.getCurrentTime());
                    }
                    timer_1 = -1;
                }, this.config.loadTimeout);
            }
        }
    };
    Replayer.prototype.applyIncremental = function (e, isSync) {
        var _this = this;
        var baselineTime = this.service.state.context.baselineTime;
        var d = e.data;
        switch (d.source) {
            case IncrementalSource.Mutation: {
                d.removes.forEach(function (mutation) {
                    var target = mirror.getNode(mutation.id);
                    if (!target) {
                        return _this.warnNodeNotFound(d, mutation.id);
                    }
                    var parent = mirror.getNode(mutation.parentId);
                    if (!parent) {
                        return _this.warnNodeNotFound(d, mutation.parentId);
                    }
                    mirror.removeNodeFromMap(target);
                    if (parent) {
                        parent.removeChild(target);
                    }
                });
                var missingNodeMap_1 = __assign({}, this.missingNodeRetryMap);
                var queue_1 = [];
                var appendNode_1 = function (mutation) {
                    var parent = mirror.getNode(mutation.parentId);
                    if (!parent) {
                        return queue_1.push(mutation);
                    }
                    var target = buildNodeWithSN(mutation.node, _this.iframe.contentDocument, mirror.map, true);
                    var previous = null;
                    var next = null;
                    if (mutation.previousId) {
                        previous = mirror.getNode(mutation.previousId);
                    }
                    if (mutation.nextId) {
                        next = mirror.getNode(mutation.nextId);
                    }
                    if (mutation.previousId === -1 || mutation.nextId === -1) {
                        missingNodeMap_1[mutation.node.id] = {
                            node: target,
                            mutation: mutation,
                        };
                        return;
                    }
                    if (previous &&
                        previous.nextSibling &&
                        previous.nextSibling.parentNode) {
                        parent.insertBefore(target, previous.nextSibling);
                    }
                    else if (next && next.parentNode) {
                        parent.contains(next)
                            ? parent.insertBefore(target, next)
                            : parent.insertBefore(target, null);
                    }
                    else {
                        parent.appendChild(target);
                    }
                    if (mutation.previousId || mutation.nextId) {
                        _this.resolveMissingNode(missingNodeMap_1, parent, target, mutation);
                    }
                };
                d.adds.forEach(function (mutation) {
                    appendNode_1(mutation);
                });
                while (queue_1.length) {
                    if (queue_1.every(function (m) { return !Boolean(mirror.getNode(m.parentId)); })) {
                        return queue_1.forEach(function (m) { return _this.warnNodeNotFound(d, m.node.id); });
                    }
                    var mutation = queue_1.shift();
                    appendNode_1(mutation);
                }
                if (Object.keys(missingNodeMap_1).length) {
                    Object.assign(this.missingNodeRetryMap, missingNodeMap_1);
                }
                d.texts.forEach(function (mutation) {
                    var target = mirror.getNode(mutation.id);
                    if (!target) {
                        return _this.warnNodeNotFound(d, mutation.id);
                    }
                    target.textContent = mutation.value;
                });
                d.attributes.forEach(function (mutation) {
                    var target = mirror.getNode(mutation.id);
                    if (!target) {
                        return _this.warnNodeNotFound(d, mutation.id);
                    }
                    for (var attributeName in mutation.attributes) {
                        if (typeof attributeName === 'string') {
                            var value = mutation.attributes[attributeName];
                            if (value !== null) {
                                target.setAttribute(attributeName, value);
                            }
                            else {
                                target.removeAttribute(attributeName);
                            }
                        }
                    }
                });
                break;
            }
            case IncrementalSource.MouseMove:
                if (isSync) {
                    var lastPosition = d.positions[d.positions.length - 1];
                    this.moveAndHover(d, lastPosition.x, lastPosition.y, lastPosition.id);
                }
                else {
                    d.positions.forEach(function (p) {
                        var action = {
                            doAction: function () {
                                _this.moveAndHover(d, p.x, p.y, p.id);
                            },
                            delay: p.timeOffset + e.timestamp - baselineTime,
                        };
                        _this.timer.addAction(action);
                    });
                }
                break;
            case IncrementalSource.MouseInteraction: {
                if (d.id === -1) {
                    break;
                }
                var event = new Event(MouseInteractions[d.type].toLowerCase());
                var target = mirror.getNode(d.id);
                if (!target) {
                    return this.debugNodeNotFound(d, d.id);
                }
                this.emitter.emit(ReplayerEvents.MouseInteraction, {
                    type: d.type,
                    target: target,
                });
                var triggerFocus = this.config.triggerFocus;
                switch (d.type) {
                    case MouseInteractions.Blur:
                        if (target.blur) {
                            target.blur();
                        }
                        break;
                    case MouseInteractions.Focus:
                        if (triggerFocus && target.focus) {
                            target.focus({
                                preventScroll: true,
                            });
                        }
                        break;
                    case MouseInteractions.Click:
                    case MouseInteractions.TouchStart:
                    case MouseInteractions.TouchEnd:
                        if (!isSync) {
                            this.moveAndHover(d, d.x, d.y, d.id);
                            this.mouse.classList.remove('active');
                            void this.mouse.offsetWidth;
                            this.mouse.classList.add('active');
                        }
                        break;
                    default:
                        target.dispatchEvent(event);
                }
                break;
            }
            case IncrementalSource.Scroll: {
                if (d.id === -1) {
                    break;
                }
                var target = mirror.getNode(d.id);
                if (!target) {
                    return this.debugNodeNotFound(d, d.id);
                }
                if (target === this.iframe.contentDocument) {
                    this.iframe.contentWindow.scrollTo({
                        top: d.y,
                        left: d.x,
                        behavior: isSync ? 'auto' : 'smooth',
                    });
                }
                else {
                    try {
                        target.scrollTop = d.y;
                        target.scrollLeft = d.x;
                    }
                    catch (error) {
                    }
                }
                break;
            }
            case IncrementalSource.ViewportResize:
                this.emitter.emit(ReplayerEvents.Resize, {
                    width: d.width,
                    height: d.height,
                });
                break;
            case IncrementalSource.Input: {
                if (d.id === -1) {
                    break;
                }
                var target = mirror.getNode(d.id);
                if (!target) {
                    return this.debugNodeNotFound(d, d.id);
                }
                try {
                    target.checked = d.isChecked;
                    target.value = d.text;
                }
                catch (error) {
                }
                break;
            }
            case IncrementalSource.MediaInteraction: {
                var target = mirror.getNode(d.id);
                if (!target) {
                    return this.debugNodeNotFound(d, d.id);
                }
                var mediaEl_1 = target;
                if (d.type === MediaInteractions.Pause) {
                    mediaEl_1.pause();
                }
                if (d.type === MediaInteractions.Play) {
                    if (mediaEl_1.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
                        mediaEl_1.play();
                    }
                    else {
                        mediaEl_1.addEventListener('canplay', function () {
                            mediaEl_1.play();
                        });
                    }
                }
                break;
            }
            case IncrementalSource.StyleSheetRule: {
                var target = mirror.getNode(d.id);
                if (!target) {
                    return this.debugNodeNotFound(d, d.id);
                }
                var styleEl = target;
                var styleSheet_1 = styleEl.sheet;
                if (d.adds) {
                    d.adds.forEach(function (_a) {
                        var rule = _a.rule, index = _a.index;
                        var _index = index === undefined
                            ? undefined
                            : Math.min(index, styleSheet_1.rules.length);
                        try {
                            styleSheet_1.insertRule(rule, _index);
                        }
                        catch (e) {
                        }
                    });
                }
                if (d.removes) {
                    d.removes.forEach(function (_a) {
                        var index = _a.index;
                        styleSheet_1.deleteRule(index);
                    });
                }
                break;
            }
        }
    };
    Replayer.prototype.resolveMissingNode = function (map, parent, target, targetMutation) {
        var previousId = targetMutation.previousId, nextId = targetMutation.nextId;
        var previousInMap = previousId && map[previousId];
        var nextInMap = nextId && map[nextId];
        if (previousInMap) {
            var _a = previousInMap, node = _a.node, mutation = _a.mutation;
            parent.insertBefore(node, target);
            delete map[mutation.node.id];
            delete this.missingNodeRetryMap[mutation.node.id];
            if (mutation.previousId || mutation.nextId) {
                this.resolveMissingNode(map, parent, node, mutation);
            }
        }
        if (nextInMap) {
            var _b = nextInMap, node = _b.node, mutation = _b.mutation;
            parent.insertBefore(node, target.nextSibling);
            delete map[mutation.node.id];
            delete this.missingNodeRetryMap[mutation.node.id];
            if (mutation.previousId || mutation.nextId) {
                this.resolveMissingNode(map, parent, node, mutation);
            }
        }
    };
    Replayer.prototype.moveAndHover = function (d, x, y, id) {
        this.mouse.style.left = x + "px";
        this.mouse.style.top = y + "px";
        var target = mirror.getNode(id);
        if (!target) {
            return this.debugNodeNotFound(d, id);
        }
        this.hoverElements(target);
    };
    Replayer.prototype.hoverElements = function (el) {
        this.iframe
            .contentDocument.querySelectorAll('.\\:hover')
            .forEach(function (hoveredEl) {
            hoveredEl.classList.remove(':hover');
        });
        var currentEl = el;
        while (currentEl) {
            if (currentEl.classList) {
                currentEl.classList.add(':hover');
            }
            currentEl = currentEl.parentElement;
        }
    };
    Replayer.prototype.isUserInteraction = function (event) {
        if (event.type !== EventType.IncrementalSnapshot) {
            return false;
        }
        return (event.data.source > IncrementalSource.Mutation &&
            event.data.source <= IncrementalSource.Input);
    };
    Replayer.prototype.restoreSpeed = function () {
        if (this.noramlSpeed === -1) {
            return;
        }
        var payload = { speed: this.noramlSpeed };
        this.setConfig(payload);
        this.emitter.emit(ReplayerEvents.SkipEnd, payload);
        this.noramlSpeed = -1;
    };
    Replayer.prototype.warnNodeNotFound = function (d, id) {
        if (!this.config.showWarning) {
            return;
        }
        console.warn(REPLAY_CONSOLE_PREFIX, "Node with id '" + id + "' not found in", d);
    };
    Replayer.prototype.debugNodeNotFound = function (d, id) {
        if (!this.config.showDebug) {
            return;
        }
        console.log(REPLAY_CONSOLE_PREFIX, "Node with id '" + id + "' not found in", d);
    };
    return Replayer;
}());

export { Replayer };
