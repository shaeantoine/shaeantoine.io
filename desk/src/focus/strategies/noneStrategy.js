/** No 3D visual at all — the object itself, already receiving cursor-tilt, carries the whole focus experience. */
export function createNoneStrategy() {
    return {
        mount() {},
        async transitionTo() {},
        unmount() {}
    };
}
