import { createCardStrategy } from './cardStrategy.js';
import { createScreenStrategy } from './screenStrategy.js';
import { createSheetStrategy } from './sheetStrategy.js';
import { createNoneStrategy } from './noneStrategy.js';
import { createModelStrategy } from './modelStrategy.js';
import { createArtifactStrategy } from './artifactStrategy.js';

const FACTORIES = {
    card: createCardStrategy,
    screen: createScreenStrategy,
    // The one visual that paginates: a clipped stack of printouts, turned a
    // sheet at a time. See the header of sheetStrategy.
    sheets: createSheetStrategy,
    none: createNoneStrategy,
    model: createModelStrategy,
    artifact: createArtifactStrategy
};

/** @param {'card'|'screen'|'sheets'|'none'|'model'|'artifact'} visual */
export function createFocusStrategy(visual) {
    const factory = FACTORIES[visual];
    if (!factory) throw new Error(`Unknown focus visual strategy "${visual}"`);
    return factory();
}
