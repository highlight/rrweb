import { serializedNodeWithId, BuildCache } from './types';
import { Mirror } from './utils';
declare global {
    interface Window {
        HIG_CONFIGURATION?: {
            enableOnHoverClass?: boolean;
        };
    }
}
export declare function addHoverClass(cssText: string, cache: BuildCache): string;
export declare function createCache(): BuildCache;
export declare function buildNodeWithSN(n: serializedNodeWithId, options: {
    doc: Document;
    mirror: Mirror;
    skipChild?: boolean;
    hackCss: boolean;
    afterAppend?: (n: Node) => unknown;
    cache: BuildCache;
}): Node | null;
declare function rebuild(n: serializedNodeWithId, options: {
    doc: Document;
    onVisit?: (node: Node) => unknown;
    hackCss?: boolean;
    afterAppend?: (n: Node) => unknown;
    cache: BuildCache;
    mirror: Mirror;
}): Node | null;
export default rebuild;
