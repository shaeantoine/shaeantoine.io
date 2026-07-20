export const STATES = {
    IDLE_LOADING: 'IDLE_LOADING',

    // Outer view: orbiting the sun, all planets visible.
    SOLAR_ORBITING: 'SOLAR_ORBITING',
    FLYING_TO_PLANET: 'FLYING_TO_PLANET',
    // A non-cluster planet's sidebar is open (panel content tier).
    PLANET_FOCUSED: 'PLANET_FOCUSED',

    // Inside Earth: mirrors the old flat ORBITING/FOCUSED pair, scoped one
    // level deeper in the focus stack.
    CLUSTER_ORBITING: 'CLUSTER_ORBITING',
    FLYING_TO_SLOT: 'FLYING_TO_SLOT',
    SLOT_FOCUSED: 'SLOT_FOCUSED',

    // Generalized: pops one level off the focus stack regardless of depth.
    RETURNING: 'RETURNING',
    // Only legal while CLUSTER_ORBITING.
    MODE_TRANSITIONING: 'MODE_TRANSITIONING'
};

export const MODES = {
    GEOGRAPHY: 'geography',
    SHAES_WORLD: 'shaesWorld'
};
