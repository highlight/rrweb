import { __assign, __read } from '../_virtual/_tslib';
import { snapshot } from 'rrweb-snapshot';
import { polyfill, on, getWindowWidth, getWindowHeight, mirror } from '../utils.js';
import { EventType, IncrementalSource } from '../types.js';
import initObservers from './observer.js';

function wrapEvent(e) {
    return __assign({}, e, { timestamp: Date.now() });
}
var wrappedEmit;
function record(options) {
    if (options === void 0) { options = {}; }
    var emit = options.emit, checkoutEveryNms = options.checkoutEveryNms, checkoutEveryNth = options.checkoutEveryNth, _a = options.blockClass, blockClass = _a === void 0 ? 'rr-block' : _a, _b = options.ignoreClass, ignoreClass = _b === void 0 ? 'rr-ignore' : _b, _c = options.inlineStylesheet, inlineStylesheet = _c === void 0 ? true : _c, _d = options.maskAllInputs, maskAllInputs = _d === void 0 ? false : _d, hooks = options.hooks, _e = options.mousemoveWait, mousemoveWait = _e === void 0 ? 50 : _e, packFn = options.packFn;
    if (!emit) {
        throw new Error('emit function is required');
    }
    polyfill();
    var lastFullSnapshotEvent;
    var incrementalSnapshotCount = 0;
    wrappedEmit = function (e, isCheckout) {
        emit((packFn ? packFn(e) : e), isCheckout);
        if (e.type === EventType.FullSnapshot) {
            lastFullSnapshotEvent = e;
            incrementalSnapshotCount = 0;
        }
        else if (e.type === EventType.IncrementalSnapshot) {
            incrementalSnapshotCount++;
            var exceedCount = checkoutEveryNth && incrementalSnapshotCount >= checkoutEveryNth;
            var exceedTime = checkoutEveryNms &&
                e.timestamp - lastFullSnapshotEvent.timestamp > checkoutEveryNms;
            if (exceedCount || exceedTime) {
                takeFullSnapshot(true);
            }
        }
    };
    function takeFullSnapshot(isCheckout) {
        if (isCheckout === void 0) { isCheckout = false; }
        wrappedEmit(wrapEvent({
            type: EventType.Meta,
            data: {
                href: window.location.href,
                width: getWindowWidth(),
                height: getWindowHeight()
            }
        }), isCheckout);
        var _a = __read(snapshot(document, blockClass, inlineStylesheet, maskAllInputs), 2), node = _a[0], idNodeMap = _a[1];
        if (!node) {
            return console.warn('Failed to snapshot the document');
        }
        mirror.map = idNodeMap;
        wrappedEmit(wrapEvent({
            type: EventType.FullSnapshot,
            data: {
                node: node,
                initialOffset: {
                    left: document.documentElement.scrollLeft,
                    top: document.documentElement.scrollTop
                }
            }
        }));
    }
    try {
        var handlers_1 = [];
        handlers_1.push(on('DOMContentLoaded', function () {
            wrappedEmit(wrapEvent({
                type: EventType.DomContentLoaded,
                data: {}
            }));
        }));
        var init_1 = function () {
            takeFullSnapshot();
            handlers_1.push(initObservers({
                mutationCb: function (m) {
                    return wrappedEmit(wrapEvent({
                        type: EventType.IncrementalSnapshot,
                        data: __assign({ source: IncrementalSource.Mutation }, m)
                    }));
                },
                mousemoveCb: function (positions, source) {
                    return wrappedEmit(wrapEvent({
                        type: EventType.IncrementalSnapshot,
                        data: {
                            source: source,
                            positions: positions
                        }
                    }));
                },
                mouseInteractionCb: function (d) {
                    return wrappedEmit(wrapEvent({
                        type: EventType.IncrementalSnapshot,
                        data: __assign({ source: IncrementalSource.MouseInteraction }, d)
                    }));
                },
                scrollCb: function (p) {
                    return wrappedEmit(wrapEvent({
                        type: EventType.IncrementalSnapshot,
                        data: __assign({ source: IncrementalSource.Scroll }, p)
                    }));
                },
                viewportResizeCb: function (d) {
                    return wrappedEmit(wrapEvent({
                        type: EventType.IncrementalSnapshot,
                        data: __assign({ source: IncrementalSource.ViewportResize }, d)
                    }));
                },
                inputCb: function (v) {
                    return wrappedEmit(wrapEvent({
                        type: EventType.IncrementalSnapshot,
                        data: __assign({ source: IncrementalSource.Input }, v)
                    }));
                },
                mediaInteractionCb: function (p) {
                    return wrappedEmit(wrapEvent({
                        type: EventType.IncrementalSnapshot,
                        data: __assign({ source: IncrementalSource.MediaInteraction }, p)
                    }));
                },
                styleSheetRuleCb: function (r) {
                    return wrappedEmit(wrapEvent({
                        type: EventType.IncrementalSnapshot,
                        data: __assign({ source: IncrementalSource.StyleSheetRule }, r)
                    }));
                },
                blockClass: blockClass,
                ignoreClass: ignoreClass,
                maskAllInputs: maskAllInputs,
                inlineStylesheet: inlineStylesheet,
                mousemoveWait: mousemoveWait
            }, hooks));
        };
        if (document.readyState === 'interactive' ||
            document.readyState === 'complete') {
            init_1();
        }
        else {
            handlers_1.push(on('load', function () {
                wrappedEmit(wrapEvent({
                    type: EventType.Load,
                    data: {}
                }));
                init_1();
            }, window));
        }
        return function () {
            handlers_1.forEach(function (h) { return h(); });
        };
    }
    catch (error) {
        console.warn(error);
    }
}
record.addCustomEvent = function (tag, payload) {
    if (!wrappedEmit) {
        throw new Error('please add custom event after start recording');
    }
    wrappedEmit(wrapEvent({
        type: EventType.Custom,
        data: {
            tag: tag,
            payload: payload
        }
    }));
};

export default record;
