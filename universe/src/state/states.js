export const STATES = {
    IDLE_LOADING: 'IDLE_LOADING',

    // Outer view: orbiting the sun, all planets visible.
    SOLAR_ORBITING: 'SOLAR_ORBITING',
    FLYING_TO_PLANET: 'FLYING_TO_PLANET',

    // Free-orbiting any non-cluster planet body, no landmark focused.
    BODY_ORBITING: 'BODY_ORBITING',

    // Inside Earth (the one 'cluster' body) — mirrors BODY_ORBITING, scoped
    // one level deeper in the focus stack; kept distinct because
    // ZoneLoader-vs-PlanetLoader pickables hinge on "is this Earth
    // specifically."
    CLUSTER_ORBITING: 'CLUSTER_ORBITING',

    // A landmark (country slot or orbiting satellite) is being flown to, or
    // is focused with its FocusPanel open. `WorldStateMachine.focusTarget`
    // (`{kind, id, parentBodyId}`) carries which one.
    FLYING_TO_LANDMARK: 'FLYING_TO_LANDMARK',
    FOCUSED: 'FOCUSED',

    // Generalized: pops one level off the focus stack regardless of depth.
    RETURNING: 'RETURNING'
};
