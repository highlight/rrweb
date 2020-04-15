export { mirror } from './utils.js';
export { EventType, IncrementalSource, MouseInteractions, ReplayerEvents } from './types.js';
import record from './record/index.js';
export { default as record } from './record/index.js';
export { Replayer } from './replay/index.js';

var addCustomEvent = record.addCustomEvent;

export { addCustomEvent };
