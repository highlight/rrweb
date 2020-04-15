import { __values, __spread, __assign } from '../../node_modules/tslib/tslib.es6.js';
import { transformAttribute, serializeNodeWithId } from '../../node_modules/rrweb-snapshot/es/rrweb-snapshot.js';
import { on, mirror, isBlocked, isAncestorRemoved, throttle, getWindowHeight, getWindowWidth, hookSetter, isTouchEvent } from '../utils.js';
import { MouseInteractions, MediaInteractions, IncrementalSource } from '../types.js';
import { deepDelete, isAncestorInSet, isParentRemoved } from './collection.js';

var moveKey = function (id, parentId) { return id + "@" + parentId; };
function isINode(n) {
    return '__sn' in n;
}
function initMutationObserver(cb, blockClass, inlineStylesheet, maskAllInputs) {
    var observer = new MutationObserver(function (mutations) {
        var e_1, _a, e_2, _b;
        var texts = [];
        var attributes = [];
        var removes = [];
        var adds = [];
        var addedSet = new Set();
        var movedSet = new Set();
        var droppedSet = new Set();
        var movedMap = {};
        var genAdds = function (n, target) {
            if (isBlocked(n, blockClass)) {
                return;
            }
            if (isINode(n)) {
                movedSet.add(n);
                var targetId = null;
                if (target && isINode(target)) {
                    targetId = target.__sn.id;
                }
                if (targetId) {
                    movedMap[moveKey(n.__sn.id, targetId)] = true;
                }
            }
            else {
                addedSet.add(n);
                droppedSet.delete(n);
            }
            n.childNodes.forEach(function (childN) { return genAdds(childN); });
        };
        mutations.forEach(function (mutation) {
            var type = mutation.type, target = mutation.target, oldValue = mutation.oldValue, addedNodes = mutation.addedNodes, removedNodes = mutation.removedNodes, attributeName = mutation.attributeName;
            switch (type) {
                case 'characterData': {
                    var value = target.textContent;
                    if (!isBlocked(target, blockClass) && value !== oldValue) {
                        texts.push({
                            value: value,
                            node: target,
                        });
                    }
                    break;
                }
                case 'attributes': {
                    var value = target.getAttribute(attributeName);
                    if (isBlocked(target, blockClass) || value === oldValue) {
                        return;
                    }
                    var item = attributes.find(function (a) { return a.node === target; });
                    if (!item) {
                        item = {
                            node: target,
                            attributes: {},
                        };
                        attributes.push(item);
                    }
                    item.attributes[attributeName] = transformAttribute(document, attributeName, value);
                    break;
                }
                case 'childList': {
                    addedNodes.forEach(function (n) { return genAdds(n, target); });
                    removedNodes.forEach(function (n) {
                        var nodeId = mirror.getId(n);
                        var parentId = mirror.getId(target);
                        if (isBlocked(n, blockClass)) {
                            return;
                        }
                        if (addedSet.has(n)) {
                            deepDelete(addedSet, n);
                            droppedSet.add(n);
                        }
                        else if (addedSet.has(target) && nodeId === -1) ;
                        else if (isAncestorRemoved(target)) ;
                        else if (movedSet.has(n) && movedMap[moveKey(nodeId, parentId)]) {
                            deepDelete(movedSet, n);
                        }
                        else {
                            removes.push({
                                parentId: parentId,
                                id: nodeId,
                            });
                        }
                        mirror.removeNodeFromMap(n);
                    });
                    break;
                }
            }
        });
        var addQueue = [];
        var pushAdd = function (n) {
            var parentId = mirror.getId(n.parentNode);
            if (parentId === -1) {
                return addQueue.push(n);
            }
            adds.push({
                parentId: parentId,
                previousId: !n.previousSibling
                    ? n.previousSibling
                    : mirror.getId(n.previousSibling),
                nextId: !n.nextSibling
                    ? n.nextSibling
                    : mirror.getId(n.nextSibling),
                node: serializeNodeWithId(n, document, mirror.map, blockClass, true, inlineStylesheet, maskAllInputs),
            });
        };
        try {
            for (var movedSet_1 = __values(movedSet), movedSet_1_1 = movedSet_1.next(); !movedSet_1_1.done; movedSet_1_1 = movedSet_1.next()) {
                var n = movedSet_1_1.value;
                pushAdd(n);
            }
        }
        catch (e_1_1) { e_1 = { error: e_1_1 }; }
        finally {
            try {
                if (movedSet_1_1 && !movedSet_1_1.done && (_a = movedSet_1.return)) _a.call(movedSet_1);
            }
            finally { if (e_1) throw e_1.error; }
        }
        try {
            for (var addedSet_1 = __values(addedSet), addedSet_1_1 = addedSet_1.next(); !addedSet_1_1.done; addedSet_1_1 = addedSet_1.next()) {
                var n = addedSet_1_1.value;
                if (!isAncestorInSet(droppedSet, n) && !isParentRemoved(removes, n)) {
                    pushAdd(n);
                }
                else if (isAncestorInSet(movedSet, n)) {
                    pushAdd(n);
                }
                else {
                    droppedSet.add(n);
                }
            }
        }
        catch (e_2_1) { e_2 = { error: e_2_1 }; }
        finally {
            try {
                if (addedSet_1_1 && !addedSet_1_1.done && (_b = addedSet_1.return)) _b.call(addedSet_1);
            }
            finally { if (e_2) throw e_2.error; }
        }
        while (addQueue.length) {
            if (addQueue.every(function (n) { return mirror.getId(n.parentNode) === -1; })) {
                break;
            }
            pushAdd(addQueue.shift());
        }
        var payload = {
            texts: texts
                .map(function (text) { return ({
                id: mirror.getId(text.node),
                value: text.value,
            }); })
                .filter(function (text) { return mirror.has(text.id); }),
            attributes: attributes
                .map(function (attribute) { return ({
                id: mirror.getId(attribute.node),
                attributes: attribute.attributes,
            }); })
                .filter(function (attribute) { return mirror.has(attribute.id); }),
            removes: removes,
            adds: adds,
        };
        if (!payload.texts.length &&
            !payload.attributes.length &&
            !payload.removes.length &&
            !payload.adds.length) {
            return;
        }
        cb(payload);
    });
    observer.observe(document, {
        attributes: true,
        attributeOldValue: true,
        characterData: true,
        characterDataOldValue: true,
        childList: true,
        subtree: true,
    });
    return observer;
}
function initMoveObserver(cb, mousemoveWait) {
    var positions = [];
    var timeBaseline;
    var wrappedCb = throttle(function (isTouch) {
        var totalOffset = Date.now() - timeBaseline;
        cb(positions.map(function (p) {
            p.timeOffset -= totalOffset;
            return p;
        }), isTouch ? IncrementalSource.TouchMove : IncrementalSource.MouseMove);
        positions = [];
        timeBaseline = null;
    }, 500);
    var updatePosition = throttle(function (evt) {
        var target = evt.target;
        var _a = isTouchEvent(evt)
            ? evt.changedTouches[0]
            : evt, clientX = _a.clientX, clientY = _a.clientY;
        if (!timeBaseline) {
            timeBaseline = Date.now();
        }
        positions.push({
            x: clientX,
            y: clientY,
            id: mirror.getId(target),
            timeOffset: Date.now() - timeBaseline,
        });
        wrappedCb(isTouchEvent(evt));
    }, mousemoveWait, {
        trailing: false,
    });
    var handlers = [
        on('mousemove', updatePosition),
        on('touchmove', updatePosition),
    ];
    return function () {
        handlers.forEach(function (h) { return h(); });
    };
}
function initMouseInteractionObserver(cb, blockClass) {
    var handlers = [];
    var getHandler = function (eventKey) {
        return function (event) {
            if (isBlocked(event.target, blockClass)) {
                return;
            }
            var id = mirror.getId(event.target);
            var _a = isTouchEvent(event)
                ? event.changedTouches[0]
                : event, clientX = _a.clientX, clientY = _a.clientY;
            cb({
                type: MouseInteractions[eventKey],
                id: id,
                x: clientX,
                y: clientY,
            });
        };
    };
    Object.keys(MouseInteractions)
        .filter(function (key) { return Number.isNaN(Number(key)) && !key.endsWith('_Departed'); })
        .forEach(function (eventKey) {
        var eventName = eventKey.toLowerCase();
        var handler = getHandler(eventKey);
        handlers.push(on(eventName, handler));
    });
    return function () {
        handlers.forEach(function (h) { return h(); });
    };
}
function initScrollObserver(cb, blockClass) {
    var updatePosition = throttle(function (evt) {
        if (!evt.target || isBlocked(evt.target, blockClass)) {
            return;
        }
        var id = mirror.getId(evt.target);
        if (evt.target === document) {
            var scrollEl = (document.scrollingElement || document.documentElement);
            cb({
                id: id,
                x: scrollEl.scrollLeft,
                y: scrollEl.scrollTop,
            });
        }
        else {
            cb({
                id: id,
                x: evt.target.scrollLeft,
                y: evt.target.scrollTop,
            });
        }
    }, 100);
    return on('scroll', updatePosition);
}
function initViewportResizeObserver(cb) {
    var updateDimension = throttle(function () {
        var height = getWindowHeight();
        var width = getWindowWidth();
        cb({
            width: Number(width),
            height: Number(height),
        });
    }, 200);
    return on('resize', updateDimension, window);
}
var INPUT_TAGS = ['INPUT', 'TEXTAREA', 'SELECT'];
var MASK_TYPES = [
    'color',
    'date',
    'datetime-local',
    'email',
    'month',
    'number',
    'range',
    'search',
    'tel',
    'text',
    'time',
    'url',
    'week',
];
var lastInputValueMap = new WeakMap();
function initInputObserver(cb, blockClass, ignoreClass, maskAllInputs) {
    function eventHandler(event) {
        var target = event.target;
        if (!target ||
            !target.tagName ||
            INPUT_TAGS.indexOf(target.tagName) < 0 ||
            isBlocked(target, blockClass)) {
            return;
        }
        var type = target.type;
        if (type === 'password' ||
            target.classList.contains(ignoreClass)) {
            return;
        }
        var text = target.value;
        var isChecked = false;
        var hasTextInput = MASK_TYPES.includes(type) || target.tagName === 'TEXTAREA';
        if (type === 'radio' || type === 'checkbox') {
            isChecked = target.checked;
        }
        else if (hasTextInput && maskAllInputs) {
            text = '*'.repeat(text.length);
        }
        cbWithDedup(target, { text: text, isChecked: isChecked });
        var name = target.name;
        if (type === 'radio' && name && isChecked) {
            document
                .querySelectorAll("input[type=\"radio\"][name=\"" + name + "\"]")
                .forEach(function (el) {
                if (el !== target) {
                    cbWithDedup(el, {
                        text: el.value,
                        isChecked: !isChecked,
                    });
                }
            });
        }
    }
    function cbWithDedup(target, v) {
        var lastInputValue = lastInputValueMap.get(target);
        if (!lastInputValue ||
            lastInputValue.text !== v.text ||
            lastInputValue.isChecked !== v.isChecked) {
            lastInputValueMap.set(target, v);
            var id = mirror.getId(target);
            cb(__assign(__assign({}, v), { id: id }));
        }
    }
    var handlers = [
        'input',
        'change',
    ].map(function (eventName) { return on(eventName, eventHandler); });
    var propertyDescriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    var hookProperties = [
        [HTMLInputElement.prototype, 'value'],
        [HTMLInputElement.prototype, 'checked'],
        [HTMLSelectElement.prototype, 'value'],
        [HTMLTextAreaElement.prototype, 'value'],
    ];
    if (propertyDescriptor && propertyDescriptor.set) {
        handlers.push.apply(handlers, __spread(hookProperties.map(function (p) {
            return hookSetter(p[0], p[1], {
                set: function () {
                    eventHandler({ target: this });
                },
            });
        })));
    }
    return function () {
        handlers.forEach(function (h) { return h(); });
    };
}
function initStyleSheetObserver(cb) {
    var insertRule = CSSStyleSheet.prototype.insertRule;
    CSSStyleSheet.prototype.insertRule = function (rule, index) {
        var id = mirror.getId(this.ownerNode);
        if (id !== -1) {
            cb({
                id: id,
                adds: [{ rule: rule, index: index }],
            });
        }
        return insertRule.apply(this, arguments);
    };
    var deleteRule = CSSStyleSheet.prototype.deleteRule;
    CSSStyleSheet.prototype.deleteRule = function (index) {
        var id = mirror.getId(this.ownerNode);
        if (id !== -1) {
            cb({
                id: id,
                removes: [{ index: index }],
            });
        }
        return deleteRule.apply(this, arguments);
    };
    return function () {
        CSSStyleSheet.prototype.insertRule = insertRule;
        CSSStyleSheet.prototype.deleteRule = deleteRule;
    };
}
function initMediaInteractionObserver(mediaInteractionCb, blockClass) {
    var handler = function (type) { return function (event) {
        var target = event.target;
        if (!target || isBlocked(target, blockClass)) {
            return;
        }
        mediaInteractionCb({
            type: type === 'play' ? MediaInteractions.Play : MediaInteractions.Pause,
            id: mirror.getId(target),
        });
    }; };
    var handlers = [on('play', handler('play')), on('pause', handler('pause'))];
    return function () {
        handlers.forEach(function (h) { return h(); });
    };
}
function mergeHooks(o, hooks) {
    var mutationCb = o.mutationCb, mousemoveCb = o.mousemoveCb, mouseInteractionCb = o.mouseInteractionCb, scrollCb = o.scrollCb, viewportResizeCb = o.viewportResizeCb, inputCb = o.inputCb, mediaInteractionCb = o.mediaInteractionCb, styleSheetRuleCb = o.styleSheetRuleCb;
    o.mutationCb = function () {
        var p = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            p[_i] = arguments[_i];
        }
        if (hooks.mutation) {
            hooks.mutation.apply(hooks, __spread(p));
        }
        mutationCb.apply(void 0, __spread(p));
    };
    o.mousemoveCb = function () {
        var p = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            p[_i] = arguments[_i];
        }
        if (hooks.mousemove) {
            hooks.mousemove.apply(hooks, __spread(p));
        }
        mousemoveCb.apply(void 0, __spread(p));
    };
    o.mouseInteractionCb = function () {
        var p = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            p[_i] = arguments[_i];
        }
        if (hooks.mouseInteraction) {
            hooks.mouseInteraction.apply(hooks, __spread(p));
        }
        mouseInteractionCb.apply(void 0, __spread(p));
    };
    o.scrollCb = function () {
        var p = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            p[_i] = arguments[_i];
        }
        if (hooks.scroll) {
            hooks.scroll.apply(hooks, __spread(p));
        }
        scrollCb.apply(void 0, __spread(p));
    };
    o.viewportResizeCb = function () {
        var p = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            p[_i] = arguments[_i];
        }
        if (hooks.viewportResize) {
            hooks.viewportResize.apply(hooks, __spread(p));
        }
        viewportResizeCb.apply(void 0, __spread(p));
    };
    o.inputCb = function () {
        var p = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            p[_i] = arguments[_i];
        }
        if (hooks.input) {
            hooks.input.apply(hooks, __spread(p));
        }
        inputCb.apply(void 0, __spread(p));
    };
    o.mediaInteractionCb = function () {
        var p = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            p[_i] = arguments[_i];
        }
        if (hooks.mediaInteaction) {
            hooks.mediaInteaction.apply(hooks, __spread(p));
        }
        mediaInteractionCb.apply(void 0, __spread(p));
    };
    o.styleSheetRuleCb = function () {
        var p = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            p[_i] = arguments[_i];
        }
        if (hooks.styleSheetRule) {
            hooks.styleSheetRule.apply(hooks, __spread(p));
        }
        styleSheetRuleCb.apply(void 0, __spread(p));
    };
}
function initObservers(o, hooks) {
    if (hooks === void 0) { hooks = {}; }
    mergeHooks(o, hooks);
    var mutationObserver = initMutationObserver(o.mutationCb, o.blockClass, o.inlineStylesheet, o.maskAllInputs);
    var mousemoveHandler = initMoveObserver(o.mousemoveCb, o.mousemoveWait);
    var mouseInteractionHandler = initMouseInteractionObserver(o.mouseInteractionCb, o.blockClass);
    var scrollHandler = initScrollObserver(o.scrollCb, o.blockClass);
    var viewportResizeHandler = initViewportResizeObserver(o.viewportResizeCb);
    var inputHandler = initInputObserver(o.inputCb, o.blockClass, o.ignoreClass, o.maskAllInputs);
    var mediaInteractionHandler = initMediaInteractionObserver(o.mediaInteractionCb, o.blockClass);
    var styleSheetObserver = initStyleSheetObserver(o.styleSheetRuleCb);
    return function () {
        mutationObserver.disconnect();
        mousemoveHandler();
        mouseInteractionHandler();
        scrollHandler();
        viewportResizeHandler();
        inputHandler();
        mediaInteractionHandler();
        styleSheetObserver();
    };
}

export default initObservers;
